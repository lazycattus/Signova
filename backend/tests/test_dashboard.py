"""Fictional dashboard fixtures; no connection to the project database."""
import unittest
from datetime import date, datetime, timezone
from uuid import uuid4
import test_registration as registration
from extensions import db
from models import Patient, Visit, VisitSummary, StaffUser

class DashboardTests(unittest.TestCase):
    setUp = registration.RegistrationTests.setUp
    tearDown = registration.RegistrationTests.tearDown
    post = registration.RegistrationTests.post
    login = registration.RegistrationTests.login

    def seed(self, day=date(2026, 11, 27), patient=None, queue='A001', answers=None):
        patient = patient or Patient(full_name='Fictional Patient', ic_number='001234567890')
        db.session.add(patient); db.session.flush()
        visit = Visit(patient_id=patient.id, visit_date=day, queue_number=queue, registered_at=datetime(2026, 11, 26, 23, 15, tzinfo=timezone.utc))
        db.session.add(visit); db.session.flush()
        if answers is not None:
            db.session.add(VisitSummary(request_id=str(uuid4()), visit_id=visit.id, version=1, answers=answers))
        db.session.commit()
        return patient, visit

    def data(self):
        response = self.client.get('/api/dashboard/daily?date=2026-11-27')
        self.assertEqual(response.status_code, 200)
        return response.get_json()

    def pain(self, score=0):
        return {'kind': 'pain', 'say': {'en': 'My head hurts.', 'bm': 'Kepala saya sakit.'}, 'pain': {'site': 'Head', 'score': score, 'side': None, 'type': None, 'onset': None}}

    def test_routes_require_staff_and_no_cache(self):
        for url in ['/api/dashboard/daily', '/api/dashboard/daily/print', f'/api/dashboard/visits/{uuid4()}/print']:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 401)
            self.assertIn('no-store', response.headers['Cache-Control'])

    def test_empty_dashboard(self):
        self.login(); data = self.data()
        self.assertEqual(data['visits'], [])
        self.assertEqual(data['metrics']['visits'], 0)
        self.assertEqual(len(data['registrations_by_hour']), 24)
        self.assertEqual(data['timezone'], 'Asia/Kuala_Lumpur')

    def test_date_filter_distinct_patients_and_masked_id(self):
        patient, _ = self.seed()
        self.seed(patient=patient, queue='A002')
        self.seed(day=date(2026, 11, 26), patient=patient, queue='A003')
        self.login(); data = self.data()
        self.assertEqual(data['metrics'], {'visits': 2, 'unique_patients': 1, 'confirmed': 0, 'pending': 2, 'with_pain': 0})
        self.assertEqual(data['visits'][0]['masked_ic'], '********7890')
        self.assertNotIn('001234567890', str(data))
        self.assertIsNone(data['visits'][0]['summary_version'])

    def test_latest_summary_and_symptom_once_per_visit(self):
        symptom = {'kind': 'symptom', 'say': {'en': 'Headache', 'bm': 'Sakit kepala'}}
        _, visit = self.seed(answers=[self.pain(9)])
        db.session.add(VisitSummary(request_id=str(uuid4()), visit_id=visit.id, version=2, answers=[symptom, symptom, self.pain(0)])); db.session.commit()
        self.login(); data = self.data()
        self.assertEqual(data['metrics']['visits'], 1)
        self.assertEqual(data['metrics']['confirmed'], 1)
        self.assertEqual(data['metrics']['with_pain'], 1)
        self.assertEqual(data['common_symptoms'], [{'label': 'Headache', 'visits': 1}])
        self.assertEqual(data['visits'][0]['summary_version'], 2)
        self.assertEqual(data['visits'][0]['pain'][0]['score'], 0)
        self.assertIsNone(data['visits'][0]['pain'][0]['onset'])

    def test_removed_pain_not_counted(self):
        _, visit = self.seed(answers=[self.pain()])
        db.session.add(VisitSummary(request_id=str(uuid4()), visit_id=visit.id, version=2, answers=[{'kind': 'typed', 'say': {'en': 'Please help.', 'bm': 'Tolong.'}}])); db.session.commit()
        self.login(); data = self.data()
        self.assertEqual(data['metrics']['with_pain'], 0)
        self.assertEqual(data['visits'][0]['pain'], [])

    def test_utc_to_malaysia_hour(self):
        self.seed(); self.login(); data = self.data()
        self.assertEqual(data['registrations_by_hour'][7], {'hour': '07:00', 'visits': 1})
        self.assertIn('2026-11-27T07:15:00+08:00', data['visits'][0]['registered_at'])

    def test_invalid_date_and_visit(self):
        self.login()
        for value in ['', '2026-99-32', '20261127', 'tomorrow']:
            self.assertEqual(self.client.get('/api/dashboard/daily?date=' + value).status_code, 400)
        for value in ['invalid', str(uuid4())]:
            self.assertEqual(self.client.get(f'/api/dashboard/visits/{value}/print').status_code, 404)

    def test_print_escape_zero_missing_and_no_full_ic(self):
        patient, visit = self.seed(answers=[self.pain()])
        patient.full_name = '<script>alert(1)</script>'; db.session.commit(); self.login()
        for url in ['/api/dashboard/daily/print?date=2026-11-27', f'/api/dashboard/visits/{visit.id}/print']:
            response = self.client.get(url); content = response.get_data(as_text=True)
            self.assertEqual(response.status_code, 200)
            self.assertIn('&lt;script&gt;', content)
            self.assertNotIn('<script>alert(1)</script>', content)
            self.assertIn('0/10', content)
            self.assertIn('Not answered', content)
            self.assertNotIn('001234567890', content)
            self.assertIn('no-store', response.headers['Cache-Control'])

    def test_logout_and_disabled_staff_revoke_access(self):
        self.login(); self.post('/api/auth/logout')
        self.assertEqual(self.client.get('/api/dashboard/daily').status_code, 401)
        self.login()
        nurse = db.session.execute(db.select(StaffUser).filter_by(username='test-nurse')).scalar_one()
        nurse.is_active = False; db.session.commit()
        self.assertEqual(self.client.get('/api/dashboard/daily').status_code, 401)
