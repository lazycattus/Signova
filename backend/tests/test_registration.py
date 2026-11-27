"""Run against an isolated in-memory database; never uses patient records."""
import os
import unittest
from uuid import uuid4

for key, value in {'SECRET_KEY': 'isolated-test-key-not-a-real-secret', 'DB_HOST': 'localhost', 'DB_PORT': '5432', 'DB_NAME': 'unused', 'DB_USER': 'unused', 'DB_PASSWORD': 'unused'}.items():
    os.environ[key] = value

from flask import g
from app import create_app
from extensions import db
from models import Patient, Visit, StaffUser, RegistrationConfirmation, VisitSummary


class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({'TESTING': True, 'SQLALCHEMY_DATABASE_URI': 'sqlite://', 'SQLALCHEMY_ENGINE_OPTIONS': {}, 'RATELIMIT_ENABLED': False})
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        nurse = StaffUser(username='test-nurse', display_name='Fictional nurse', role='staff')
        nurse.set_password('fictional-test-password')
        db.session.add(nurse)
        db.session.commit()
        # The test keeps a DB context for assertions. Clear request-only CSRF
        # cache after each request, as separate real HTTP requests naturally do.
        @self.app.teardown_request
        def clear_request_cache(error):
            g.pop('csrf_token', None)
            g.pop('csrf_valid', None)
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def post(self, path, body=None, client=None):
        c = client or self.client
        token = c.get('/api/auth/csrf').get_json()['csrf_token']
        return c.post(path, json=body or {}, headers={'X-CSRFToken': token})

    def login(self, client=None):
        result = self.post('/api/auth/login', {'username': 'test-nurse', 'password': 'fictional-test-password'}, client)
        self.assertEqual(result.status_code, 200)

    def registration(self, identifier='TEST-ONE', name='Fictional patient'):
        self.login()
        patient = self.post('/api/patients/lookup', {'ic_number': identifier}).get_json()['patient']
        body = {'request_id': str(uuid4()), 'full_name': name, 'ic_number': identifier, 'preferred_language': 'en', 'identity_confirmed': True, 'expected_patient_id': patient['id'] if patient else None}
        result = self.post('/api/visits/register', body)
        self.assertIn(result.status_code, (200, 201), result.get_json())
        return body, result.get_json()['visit']

    def summary(self, score=0, **patch):
        value = {'request_id': str(uuid4()), 'patient_confirmed': True, 'answers': [{'kind': 'pain', 'say': {'en': 'My reported pain.', 'bm': 'Sakit yang saya laporkan.'}, 'pain': {'score': score, 'site': 'Head', 'side': None, 'type': None, 'onset': None}}]}
        value.update(patch)
        return value

    def test_public_identity_lookup_and_registration_are_blocked(self):
        self.assertEqual(self.post('/api/patients/lookup', {'ic_number': 'TEST-ONE'}).status_code, 401)
        self.assertEqual(self.post('/api/visits/register', {}).status_code, 401)
        self.assertEqual(db.session.query(Patient).count(), 0)

    def test_unregistered_summary_never_writes_clinical_data(self):
        result = self.post('/api/visits/current/summaries', self.summary())
        self.assertEqual(result.status_code, 403)
        self.assertEqual(db.session.query(VisitSummary).count(), 0)

    def test_confirmation_is_explicit(self):
        self.login()
        result = self.post('/api/visits/register', {'identity_confirmed': False})
        self.assertEqual(result.status_code, 400)
        self.assertEqual(db.session.query(Visit).count(), 0)

    def test_registration_is_idempotent_and_current_only(self):
        body, visit = self.registration()
        repeat = self.post('/api/visits/register', body)
        self.assertEqual(repeat.status_code, 200)
        self.assertEqual(repeat.get_json()['visit']['id'], visit['id'])
        self.assertEqual(db.session.query(Visit).count(), 1)
        other = self.app.test_client()
        self.assertIsNone(other.get('/api/visits/current').get_json()['visit'])
        self.assertEqual(self.post('/api/visits/current/summaries', self.summary(), other).status_code, 403)

    def test_changed_retry_rejected(self):
        body, _ = self.registration()
        body['full_name'] = 'Changed patient'
        self.assertEqual(self.post('/api/visits/register', body).status_code, 409)

    def test_existing_patient_requires_explicit_record_match(self):
        self.registration()
        result = self.post('/api/visits/register', {'request_id': str(uuid4()), 'full_name': 'Someone else', 'ic_number': 'TEST-ONE', 'preferred_language': 'en', 'identity_confirmed': True, 'expected_patient_id': None})
        self.assertEqual(result.status_code, 409)
        self.assertEqual(db.session.query(Patient).count(), 1)

    def test_active_visit_is_reused_and_old_session_revoked(self):
        _, first = self.registration()
        _, second = self.registration()
        self.assertEqual(first['id'], second['id'])
        self.assertEqual(db.session.query(Visit).count(), 1)
        self.assertEqual(db.session.query(RegistrationConfirmation).filter(RegistrationConfirmation.ended_at.is_(None)).count(), 1)

    def test_no_ic_and_leading_zero_identifiers(self):
        self.registration(identifier=None)
        self.registration(identifier='000101-01-0001', name='Another fictional patient')
        self.assertIsNotNone(db.session.query(Patient).filter_by(ic_number='000101010001').first())
        self.assertEqual(db.session.query(Patient).filter(Patient.ic_number.is_(None)).count(), 1)

    def test_logout_retains_only_patient_current_visit_access(self):
        _, visit = self.registration()
        self.assertEqual(self.post('/api/auth/logout').status_code, 200)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        self.assertEqual(self.client.get('/api/visits/current').get_json()['visit']['id'], visit['id'])
        self.assertEqual(self.post('/api/visits/current/summaries', self.summary()).status_code, 201)
        self.assertEqual(self.post('/api/patients/lookup', {'ic_number': 'TEST-ONE'}).status_code, 401)

    def test_patient_confirmation_zero_missing_and_versioned_retry(self):
        self.registration()
        self.assertEqual(self.post('/api/visits/current/summaries', self.summary(patient_confirmed=False)).status_code, 400)
        value = self.summary()
        first = self.post('/api/visits/current/summaries', value)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.get_json()['version'], 1)
        self.assertEqual(self.post('/api/visits/current/summaries', value).get_json()['version'], 1)
        saved = db.session.query(VisitSummary).one()
        self.assertEqual(saved.answers[0]['pain']['score'], 0)
        self.assertIsNone(saved.answers[0]['pain']['onset'])
        self.assertIsNone(saved.answers[0]['pain']['type'])
        self.assertEqual(self.post('/api/visits/current/summaries', self.summary(score=4)).get_json()['version'], 2)

    def test_invalid_pain_staff_text_and_empty_answers_rejected(self):
        self.registration()
        for value in [self.summary(score=11), self.summary(score=True), self.summary(answers=[]), self.summary(answers=[{'kind': 'staff', 'say': {'en': 'Staff reply', 'bm': 'Staf'}}])]:
            self.assertEqual(self.post('/api/visits/current/summaries', value).status_code, 400)
        self.assertEqual(db.session.query(VisitSummary).count(), 0)

    def test_ending_device_session_keeps_saved_visit_but_revokes_access(self):
        _, visit = self.registration()
        self.post('/api/visits/current/summaries', self.summary())
        self.assertEqual(self.post('/api/visits/current/end').status_code, 200)
        self.assertIsNone(self.client.get('/api/visits/current').get_json()['visit'])
        self.assertEqual(self.post('/api/visits/current/summaries', self.summary()).status_code, 403)
        self.assertEqual(db.session.get(Visit, visit['id']).status, 'waiting')
        self.assertEqual(db.session.query(VisitSummary).count(), 1)

    def test_csrf_is_required_and_private_results_are_not_cached(self):
        self.login()
        self.assertEqual(self.client.post('/api/visits/register', json={}).status_code, 400)
        result = self.client.get('/api/visits/current')
        self.assertEqual(result.headers['Cache-Control'], 'no-store')

    def test_unauthenticated_idle_lock_revokes_only_own_device(self):
        self.registration()
        self.post('/api/auth/logout')
        self.assertEqual(self.post('/api/visits/current/lock').status_code, 200)
        self.assertEqual(self.post('/api/visits/current/summaries', self.summary()).status_code, 403)
        self.assertEqual(db.session.query(Visit).count(), 1)


if __name__ == '__main__':
    unittest.main()
