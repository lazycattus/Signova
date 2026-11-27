"""Report versioning and region persistence with fictional data only."""
import unittest
from uuid import uuid4
import test_registration as registration_module
from extensions import db
from models import VisitSummary
from visits import report_region

class IndividualReportTests(unittest.TestCase):
    setUp = registration_module.RegistrationTests.setUp
    tearDown = registration_module.RegistrationTests.tearDown
    login = registration_module.RegistrationTests.login
    post = registration_module.RegistrationTests.post
    registration = registration_module.RegistrationTests.registration
    summary = registration_module.RegistrationTests.summary

    def test_report_auth_and_pending_summary(self):
        _, visit = self.registration()
        url = f"/api/dashboard/visits/{visit['id']}/report"
        self.assertEqual(self.app.test_client().get(url).status_code, 401)
        self.assertEqual(self.client.get(url).status_code, 409)
        self.assertEqual(self.client.get('/api/dashboard/visits/not-a-uuid/report').status_code, 404)

    def test_region_saved_and_read_after_session_refresh(self):
        _, visit = self.registration()
        body = self.summary()
        region = {'model_version': 'signova-body-v1', 'part': 'head', 'sub': 'face', 'side': None}
        body['answers'][0]['pain']['region'] = region
        self.assertEqual(self.post('/api/visits/current/summaries', body).status_code, 201)
        db.session.remove()
        response = self.client.get(f"/api/dashboard/visits/{visit['id']}/report")
        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['visit']['pain'][0]['region'], region)
        self.assertEqual(data['visit']['pain'][0]['score'], 0)
        self.assertIsNone(data['visit']['pain'][0]['onset'])
        self.assertEqual(data['report_id'], f"SNV-{visit['id']}-V1")
        self.assertIn('no-store', response.headers['Cache-Control'])
        self.assertNotIn('TEST-ONE', response.get_data(as_text=True))

    def test_versions_can_be_reopened_without_using_latest_data(self):
        _, visit = self.registration()
        self.post('/api/visits/current/summaries', self.summary(2))
        self.post('/api/visits/current/summaries', self.summary(8))
        url = f"/api/dashboard/visits/{visit['id']}/report"
        latest = self.client.get(url).get_json()
        older = self.client.get(url + '?version=1').get_json()
        self.assertEqual(latest['visit']['summary_version'], 2)
        self.assertEqual(latest['visit']['pain'][0]['score'], 8)
        self.assertEqual(older['visit']['pain'][0]['score'], 2)
        self.assertEqual(self.client.get(url + '?version=99').status_code, 404)
        self.assertEqual(self.client.get(url + '?version=-1').status_code, 400)
        self.assertEqual(self.client.get(url + '?version=abc').status_code, 400)

    def test_legacy_reports_do_not_invent_region(self):
        _, visit = self.registration()
        self.post('/api/visits/current/summaries', self.summary())
        body = self.client.get(f"/api/dashboard/visits/{visit['id']}/report").get_json()
        self.assertNotIn('region', body['visit']['pain'][0])

    def test_invalid_regions_are_rejected(self):
        good = {'model_version': 'signova-body-v1', 'part': 'leg', 'sub': 'knee', 'side': 'l'}
        self.assertEqual(report_region(good, 'Left'), good)
        for patch in [{'part': 'unknown'}, {'sub': 'face'}, {'side': 'r'}, {'model_version': 'v999'}, {'side': []}, {'part': []}, {'sub': []}]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                report_region({**good, **patch}, 'Left')
        with self.assertRaises(ValueError):
            report_region(None, None)

    def test_invalid_region_does_not_save_summary(self):
        self.registration()
        body = self.summary()
        body['answers'][0]['pain']['region'] = {'model_version': 'v999', 'part': 'head'}
        self.assertEqual(self.post('/api/visits/current/summaries', body).status_code, 400)
        self.assertEqual(db.session.query(VisitSummary).count(), 0)
