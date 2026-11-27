"""Nurse-only daily reporting over saved visits and latest confirmed summaries."""
from collections import Counter
from datetime import date, datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, render_template_string, request
from sqlalchemy import and_, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import joinedload

from auth import staff_required
from extensions import db
from models import Visit, VisitSummary

bp = Blueprint('dashboard', __name__, url_prefix='/api/dashboard')
KL = ZoneInfo('Asia/Kuala_Lumpur')


def selected_day():
    raw = request.args.get('date')
    if raw is None:
        return datetime.now(KL).date()
    try:
        result = date.fromisoformat(raw)
        if result.isoformat() != raw:
            raise ValueError()
        return result
    except ValueError:
        raise ValueError('Choose a valid date in YYYY-MM-DD format.')


def local_time(value):
    if value is None:
        return None
    # PostgreSQL returns aware timestamps; SQLite fixtures return naive UTC.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(KL).isoformat()


def masked_identifier(value):
    return ('*' * max(0, len(value) - 4) + value[-4:]) if value else None


def rows_for(day):
    latest = select(VisitSummary.visit_id, func.max(VisitSummary.version).label('version')).group_by(VisitSummary.visit_id).subquery()
    statement = (select(Visit, VisitSummary).options(joinedload(Visit.patient))
        .outerjoin(latest, latest.c.visit_id == Visit.id)
        .outerjoin(VisitSummary, and_(VisitSummary.visit_id == Visit.id, VisitSummary.version == latest.c.version))
        .where(Visit.visit_date == day).order_by(Visit.registered_at, Visit.queue_number, Visit.id))
    return db.session.execute(statement).all()


def record(visit, summary):
    answers = summary.answers if summary else []
    return {
        'id': visit.id, 'patient_id': visit.patient_id,
        'patient_name': visit.patient.full_name,
        'masked_ic': masked_identifier(visit.patient.ic_number),
        'queue_number': visit.queue_number, 'visit_date': visit.visit_date.isoformat(),
        'registered_at': local_time(visit.registered_at),
        'consultation_room': visit.consultation_room, 'status': visit.status,
        'summary_version': summary.version if summary else None,
        'confirmed_at': local_time(summary.confirmed_at) if summary else None,
        'answers': answers,
        'symptoms': [a['say'] for a in answers if a['kind'] == 'symptom'],
        'pain': [a['pain'] for a in answers if a['kind'] == 'pain'],
    }


def daily_data(day):
    records = [record(v, s) for v, s in rows_for(day)]
    hours = Counter()
    symptoms = Counter()
    for row in records:
        if row['registered_at']:
            hours[datetime.fromisoformat(row['registered_at']).hour] += 1
        # One visit contributes at most once per exact reported symptom label.
        symptoms.update({s['en'] for s in row['symptoms']})
    confirmed = sum(r['summary_version'] is not None for r in records)
    return {
        'date': day.isoformat(), 'timezone': 'Asia/Kuala_Lumpur',
        'generated_at': datetime.now(KL).isoformat(),
        'metrics': {'visits': len(records), 'unique_patients': len({r['patient_id'] for r in records}),
            'confirmed': confirmed, 'pending': len(records) - confirmed,
            'with_pain': sum(bool(r['pain']) for r in records)},
        'registrations_by_hour': [{'hour': f'{h:02}:00', 'visits': hours[h]} for h in range(24)],
        'common_symptoms': [{'label': label, 'visits': count} for label, count in sorted(symptoms.items(), key=lambda p: (-p[1], p[0]))[:8]],
        'visits': records,
    }


@bp.after_request
def private_response(response):
    response.headers['Cache-Control'] = 'no-store, private'
    response.headers['Vary'] = 'Cookie'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    return response


@bp.errorhandler(ValueError)
def invalid_input(error):
    return jsonify(error=str(error)), 400


@bp.errorhandler(SQLAlchemyError)
def database_unavailable(error):
    db.session.rollback()
    return jsonify(error='Could not load saved records. Please try again.'), 503


@bp.get('/daily')
@staff_required
def daily():
    return jsonify(daily_data(selected_day()))


REPORT = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Signova patient report</title>
<style>
body{font:14px/1.6 system-ui,sans-serif;color:#172b42;max-width:900px;margin:32px auto;padding:0 24px}h1{margin-bottom:0}h2{margin-top:24px}small{color:#475569}article{border-top:2px solid #ccd6df;margin-top:26px;padding-top:10px}dl{display:grid;grid-template-columns:150px 1fr;gap:4px 16px}dd{margin:0;overflow-wrap:anywhere}li,p{overflow-wrap:anywhere}button{padding:12px 20px;background:#164e63;color:white;border:0;border-radius:8px}section{break-inside:avoid} @page{size:A4;margin:18mm} @media print{body{margin:0;padding:0;max-width:none;font-size:11px}.controls{display:none}h2,h3{break-after:avoid}article{border-top:1px solid #999}}
</style></head><body>
<div class="controls"><button onclick="window.print()">Print / Save as PDF</button><p>Choose Save as PDF in your browser’s print dialog. Close this report before handing the device to a patient.</p></div>
<h1>Signova · {{ 'Patient summary' if individual else 'Daily patient report' }}</h1>
<p>{{ data.date }} · Asia/Kuala_Lumpur<br><small>Generated {{ data.generated_at }}. Latest patient-confirmed answers at generation time. Patient-reported information; no diagnosis is generated.</small></p>
{% if not individual %}<p>{{ data.metrics.visits }} visits · {{ data.metrics.unique_patients }} unique patients · {{ data.metrics.confirmed }} confirmed summaries · {{ data.metrics.pending }} pending · {{ data.metrics.with_pain }} visits with reported pain</p>{% endif %}
{% if not data.visits %}<p>No visits registered for this date.</p>{% endif %}
{% for row in data.visits %}<article><h2>{{ row.queue_number }} · {{ row.patient_name }}</h2>
<dl><dt>Identification</dt><dd>{{ row.masked_ic or 'Not answered' }}</dd><dt>Registered (MYT)</dt><dd>{{ row.registered_at or 'Not answered' }}</dd><dt>Room</dt><dd>{{ row.consultation_room or 'Not answered' }}</dd><dt>Visit status</dt><dd>{{ row.status }}</dd><dt>Summary</dt><dd>{% if row.summary_version %}Confirmed version {{ row.summary_version }} · {{ row.confirmed_at }}{% else %}Summary not submitted{% endif %}</dd></dl>
<section><h3>Symptoms reported</h3>{% for symptom in row.symptoms %}<p>{{ symptom.en }}<br><small>{{ symptom.bm }}</small></p>{% else %}<p>Not answered</p>{% endfor %}</section>
<h3>Pain reported</h3>{% for pain in row.pain %}<section><dl>{% for key in ['site','side','score','type','onset'] %}<dt>{{ key|capitalize }}</dt><dd>{{ pain[key] if pain[key] is not none else 'Not answered' }}{% if key == 'score' %}/10{% endif %}</dd>{% endfor %}</dl></section>{% else %}<p>Not answered</p>{% endfor %}
<h3>Other patient messages</h3>{% for answer in row.answers if answer.kind not in ['pain','symptom'] %}<section><p>{{ answer.say.en }}<br><small>{{ answer.say.bm }}</small></p></section>{% else %}<p>Not answered</p>{% endfor %}
</article>{% endfor %}</body></html>'''


@bp.get('/daily/print')
@staff_required
def daily_print():
    return render_template_string(REPORT, data=daily_data(selected_day()), individual=False)


@bp.get('/visits/<visit_id>/print')
@staff_required
def patient_print(visit_id):
    try:
        visit_id = str(UUID(visit_id))
    except ValueError:
        return jsonify(error='Visit not found.'), 404
    visit = db.session.get(Visit, visit_id)
    if not visit:
        return jsonify(error='Visit not found.'), 404
    summary = db.session.execute(select(VisitSummary).where(VisitSummary.visit_id == visit.id).order_by(VisitSummary.version.desc())).scalars().first()
    data = {'date': visit.visit_date.isoformat(), 'generated_at': datetime.now(KL).isoformat(), 'visits': [record(visit, summary)]}
    return render_template_string(REPORT, data=data, individual=True)


@bp.get('/visits/<visit_id>/report')
@staff_required
def individual_report(visit_id):
    try:
        visit_id = str(UUID(visit_id))
    except ValueError:
        return jsonify(error='Visit not found.'), 404
    visit = db.session.get(Visit, visit_id)
    if not visit:
        return jsonify(error='Visit not found.'), 404
    statement = select(VisitSummary).where(VisitSummary.visit_id == visit.id)
    raw_version = request.args.get('version')
    if raw_version is not None:
        if not raw_version.isdigit() or not 0 < int(raw_version) <= 2147483647:
            raise ValueError('Choose a valid summary version.')
        statement = statement.where(VisitSummary.version == int(raw_version))
    summary = db.session.execute(statement.order_by(VisitSummary.version.desc())).scalars().first()
    if not summary:
        return jsonify(error='Summary not submitted.' if raw_version is None else 'Summary version not found.'), 409 if raw_version is None else 404
    return jsonify(
        report_id=f'SNV-{visit.id}-V{summary.version}',
        generated_at=datetime.now(KL).isoformat(), timezone='Asia/Kuala_Lumpur',
        model_version='signova-body-v1', visit=record(visit, summary),
    )


def init_dashboard(app):
    app.register_blueprint(bp)
