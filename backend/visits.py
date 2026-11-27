"""Single-front-desk registration and current-visit patient confirmation.

Unregistered clinical drafts never reach this module. A nurse explicitly matches
an identity before a signed browser session can read/write that current visit.
"""
import hashlib
import json
import re
from datetime import datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from flask import Blueprint, g, jsonify, request, session
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError

from auth import limiter, staff_required
from extensions import db
from models import Patient, RegistrationConfirmation, Visit, VisitSummary

visit_bp = Blueprint('visits', __name__, url_prefix='/api')
KL = ZoneInfo('Asia/Kuala_Lumpur')


def today():
    return datetime.now(KL).date()


def uuid_value(value):
    try:
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise ValueError('A valid request ID is required.')


def clean_text(value, limit, label, required=False):
    if value is None and not required:
        return None
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError(f'Check {label}.')
    value = value.strip()
    if required and not value:
        raise ValueError(f'{label} is required.')
    return value or None


def ic_value(value):
    value = clean_text(value, 32, 'IC number')
    if not value:
        return None
    value = re.sub(r'\s+', '', value).upper()
    digits = value.replace('-', '')
    if re.fullmatch(r'\d{12}', digits):
        return digits
    if re.fullmatch(r'TEST-[A-Z0-9]{3,24}', value):
        return value
    raise ValueError('Enter a 12-digit IC, a fictional TEST- ID, or choose nurse help.')


def json_body():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ValueError('Send a JSON object.')
    return value


def current_registration():
    key = session.get('current_registration')
    registration = db.session.get(RegistrationConfirmation, key) if isinstance(key, str) else None
    if not registration or registration.ended_at:
        return None
    visit = db.session.get(Visit, registration.visit_id)
    if not visit or visit.visit_date != today():
        return None
    return registration


def current_visit():
    registration = current_registration()
    return db.session.get(Visit, registration.visit_id) if registration else None


def visit_details(visit):
    return {
        'id': visit.id, 'patient_id': visit.patient_id,
        'patient_name': visit.patient.full_name,
        'preferred_language': visit.patient.preferred_language,
        'queue_number': visit.queue_number, 'visit_date': visit.visit_date.isoformat(),
        'consultation_room': visit.consultation_room,
    }


@visit_bp.after_request
def no_patient_cache(response):
    response.headers['Cache-Control'] = 'no-store'
    return response


@visit_bp.errorhandler(ValueError)
def bad_input(error):
    return jsonify(error=str(error)), 400


@visit_bp.errorhandler(SQLAlchemyError)
def database_problem(error):
    db.session.rollback()
    # Do not expose SQL parameters, names or IC numbers in responses/logs.
    return jsonify(error='Could not save. Check the database and try again.'), 503


@visit_bp.post('/patients/lookup')
@staff_required
@limiter.limit('30 per minute')
def lookup_patient():
    identifier = ic_value(json_body().get('ic_number'))
    if not identifier:
        return jsonify(patient=None)
    patient = db.session.execute(select(Patient).where(Patient.ic_number == identifier)).scalar_one_or_none()
    if not patient:
        return jsonify(patient=None)
    active = db.session.execute(select(Visit).where(
        Visit.patient_id == patient.id, Visit.visit_date == today(),
        Visit.status.in_(['waiting', 'called']),
    ).order_by(Visit.registered_at.desc())).scalars().first()
    return jsonify(patient={
        'id': patient.id, 'full_name': patient.full_name,
        'preferred_language': patient.preferred_language,
        'active_visit': visit_details(active) if active else None,
    })


@visit_bp.post('/visits/register')
@staff_required
@limiter.limit('20 per minute')
def confirm_registration():
    data = json_body()
    visit_day = today()
    if data.get('identity_confirmed') is not True:
        raise ValueError('The nurse must confirm the patient identity.')
    request_id = uuid_value(data.get('request_id'))
    name = clean_text(data.get('full_name'), 150, 'Full name', True)
    identifier = ic_value(data.get('ic_number'))
    lang = data.get('preferred_language')
    if lang not in ('en', 'bm'):
        raise ValueError('Choose English or Bahasa Malaysia.')
    room = clean_text(data.get('consultation_room'), 50, 'Consultation room')
    expected = data.get('expected_patient_id')
    if expected is not None:
        expected = uuid_value(expected)
    digest = hashlib.sha256(json.dumps([name, identifier, lang, room, expected], ensure_ascii=False).encode()).hexdigest()
    # One daily queue allocator across simultaneous front-desk requests.
    # SQLite is used only by isolated functional tests, not the deployed app.
    if db.engine.dialect.name == 'postgresql':
        db.session.execute(text('SELECT pg_advisory_xact_lock(:scope, :day)'),
                           {'scope': 5457742, 'day': int(visit_day.strftime('%Y%m%d'))})
    prior = db.session.get(RegistrationConfirmation, request_id)
    if prior:
        if prior.payload_digest != digest or prior.ended_at:
            return jsonify(error='This request was changed or ended. Start a new registration.'), 409
        visit = db.session.get(Visit, prior.visit_id)
        if visit.visit_date != visit_day:
            return jsonify(error='This registration belongs to a previous day.'), 409
        session['current_registration'] = prior.id
        return jsonify(visit=visit_details(visit), reused=True)
    patient = db.session.execute(select(Patient).where(Patient.ic_number == identifier)).scalar_one_or_none() if identifier else None
    if (patient.id if patient else None) != expected:
        return jsonify(error='Patient details changed. Ask the nurse to look up the record again.'), 409
    if not patient:
        patient = Patient(full_name=name, ic_number=identifier, preferred_language=lang)
        db.session.add(patient)
        db.session.flush()
    # Never overwrite a returning patient's permanent identity from a public draft.
    visit = db.session.execute(select(Visit).where(
        Visit.patient_id == patient.id, Visit.visit_date == visit_day,
        Visit.status.in_(['waiting', 'called']),
    ).order_by(Visit.registered_at.desc())).scalars().first()
    reused = visit is not None
    if not visit:
        numbers = db.session.scalars(select(Visit.queue_number).where(Visit.visit_date == visit_day)).all()
        high = max([int(n[1:]) for n in numbers if re.fullmatch(r'A\d+', n)] or [0])
        visit = Visit(patient_id=patient.id, visit_date=visit_day, queue_number=f'A{high + 1:03}', consultation_room=room)
        db.session.add(visit)
        db.session.flush()
    previous = current_registration()
    if previous:
        previous.ended_at = datetime.now(timezone.utc)
    registration = RegistrationConfirmation(id=request_id, payload_digest=digest, visit_id=visit.id, confirmed_by=g.staff_user.id)
    db.session.add(registration)
    db.session.commit()
    session['current_registration'] = registration.id
    return jsonify(visit=visit_details(visit), reused=reused), 200 if reused else 201


@visit_bp.get('/visits/current')
def get_current_visit():
    visit = current_visit()
    return jsonify(visit=visit_details(visit) if visit else None)


@visit_bp.post('/visits/current/end')
@staff_required
def end_device_session():
    registration = current_registration()
    if registration:
        registration.ended_at = datetime.now(timezone.utc)
        db.session.commit()
    session.pop('current_registration', None)
    # End device access, not the clinical visit or its queue status.
    return jsonify(message='Device session ended.')


KINDS = {'request', 'need', 'reply', 'symptom', 'feeling', 'question', 'pain', 'answer', 'typed'}


REPORT_REGIONS = {
    'head': {'top', 'face', 'jaw', 'back'}, 'neck': {'front', 'back'},
    'chest': set(), 'stomach': {'upper', 'lower', 'groin'},
    'upperback': set(), 'lowerback': set(),
    'arm': {'shoulder', 'upperarm', 'elbow', 'forearm', 'wrist'},
    'hand': {'palm', 'backofhand', 'fingers'},
    'leg': {'hip', 'thigh', 'knee', 'shin', 'calf'},
    'foot': {'ankle', 'heel', 'sole', 'top', 'toes'},
}


def report_region(raw, side):
    if not isinstance(raw, dict) or raw.get('model_version') != 'signova-body-v1':
        raise ValueError('Check the pain body-map version.')
    part, sub, selected_side = raw.get('part'), raw.get('sub'), raw.get('side')
    if not isinstance(part, str) or part not in REPORT_REGIONS:
        raise ValueError('Check the pain body region.')
    if sub is not None and (not isinstance(sub, str) or sub not in REPORT_REGIONS[part]):
        raise ValueError('Check the pain sub-region.')
    if selected_side not in (None, 'l', 'r') or side != {'l': 'Left', 'r': 'Right', None: None}[selected_side]:
        raise ValueError('The body-map side must match the reported side.')
    if part in ('head', 'neck') and selected_side is not None:
        raise ValueError('Check the pain body-map side.')
    if part in ('arm', 'hand', 'leg', 'foot') and selected_side is None:
        raise ValueError('Choose left or right for this body region.')
    return {'model_version': 'signova-body-v1', 'part': part, 'sub': sub, 'side': selected_side}


def summary_answers(raw):
    if not isinstance(raw, list) or not 1 <= len(raw) <= 50:
        raise ValueError('Choose between 1 and 50 messages before confirming.')
    answers = []
    for item in raw:
        if not isinstance(item, dict) or item.get('kind') not in KINDS:
            raise ValueError('Check the patient messages.')
        say = item.get('say')
        if not isinstance(say, dict):
            raise ValueError('Check the message text.')
        answer = {'kind': item['kind'], 'say': {
            'en': clean_text(say.get('en'), 2000, 'English message', True),
            'bm': clean_text(say.get('bm'), 2000, 'Malay message', True),
        }}
        if item['kind'] == 'pain':
            pain = item.get('pain')
            if not isinstance(pain, dict) or type(pain.get('score')) is not int or not 0 <= pain['score'] <= 10:
                raise ValueError('A pain score must be a number from 0 to 10.')
            answer['pain'] = {
                'score': pain['score'],
                'site': clean_text(pain.get('site'), 150, 'Pain location', True),
                'side': clean_text(pain.get('side'), 30, 'Side'),
                'type': clean_text(pain.get('type'), 80, 'Pain type'),
                'onset': clean_text(pain.get('onset'), 200, 'Pain onset'),
            }
            if 'region' in pain:
                answer['pain']['region'] = report_region(pain['region'], answer['pain']['side'])
        answers.append(answer)
    return answers


@visit_bp.post('/visits/current/summaries')
@limiter.limit('20 per minute')
def confirm_patient_summary():
    visit = current_visit()
    if not visit:
        return jsonify(error='A nurse must confirm the current visit before anything is saved.'), 403
    data = json_body()
    if data.get('patient_confirmed') is not True:
        raise ValueError('Please confirm that these are your answers.')
    request_id = uuid_value(data.get('request_id'))
    answers = summary_answers(data.get('answers'))
    # Serialize versions for this visit and deduplicate retries after connection loss.
    db.session.execute(select(Visit).where(Visit.id == visit.id).with_for_update()).scalar_one()
    prior = db.session.execute(select(VisitSummary).where(VisitSummary.request_id == request_id)).scalar_one_or_none()
    if prior:
        if prior.visit_id != visit.id or prior.answers != answers:
            return jsonify(error='This confirmation request has changed. Review it again.'), 409
        return jsonify(id=prior.id, version=prior.version)
    version = (db.session.scalar(select(func.max(VisitSummary.version)).where(VisitSummary.visit_id == visit.id)) or 0) + 1
    summary = VisitSummary(request_id=request_id, visit_id=visit.id, version=version, answers=answers)
    db.session.add(summary)
    db.session.commit()
    return jsonify(id=summary.id, version=summary.version), 201


def init_visits(app):
    app.register_blueprint(visit_bp)


@visit_bp.post('/visits/current/lock')
def lock_device_session():
    """An idle shared device can revoke its own access; no saved record is deleted."""
    registration = current_registration()
    if registration:
        registration.ended_at = datetime.now(timezone.utc)
        db.session.commit()
    session.pop('current_registration', None)
    return jsonify(message='Current device access cleared.')
