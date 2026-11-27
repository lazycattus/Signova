from werkzeug.security import generate_password_hash, check_password_hash
from uuid import uuid4

from extensions import db


def new_id():
    return str(uuid4())


class Patient(db.Model):
    __tablename__ = "patients"

    id = db.Column(db.String(36), primary_key=True, default=new_id)
    full_name = db.Column(db.String(150), nullable=False)
    ic_number = db.Column(db.String(32), unique=True, nullable=True)
    preferred_language = db.Column(
        db.String(2), nullable=False, server_default="en"
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        server_default=db.func.now(),
    )

    visits = db.relationship("Visit", back_populates="patient")

    __table_args__ = (
        db.CheckConstraint(
            "length(trim(full_name)) > 0",
            name="ck_patient_name_not_blank",
        ),
        db.CheckConstraint(
            "preferred_language IN ('en', 'bm')",
            name="ck_patient_language",
        ),
    )


class Visit(db.Model):
    __tablename__ = "visits"

    id = db.Column(db.String(36), primary_key=True, default=new_id)
    patient_id = db.Column(
        db.String(36),
        db.ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    visit_date = db.Column(db.Date, nullable=False, index=True)
    queue_number = db.Column(db.String(20), nullable=False)
    consultation_room = db.Column(db.String(50), nullable=True)
    status = db.Column(
        db.String(20), nullable=False, server_default="waiting"
    )
    registered_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        server_default=db.func.now(),
    )

    patient = db.relationship("Patient", back_populates="visits")

    __table_args__ = (
        db.UniqueConstraint(
            "visit_date", "queue_number", name="uq_visit_daily_queue"
        ),
        db.CheckConstraint(
            "status IN ('waiting', 'called', 'served', 'cancelled')",
            name="ck_visit_status",
        ),
    )
class StaffUser(db.Model):
    __tablename__ = "staff_users"

    id = db.Column(db.String(36), primary_key=True, default=new_id)
    username = db.Column(db.String(80), unique=True, nullable=False)
    display_name = db.Column(db.String(150), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    role = db.Column(
        db.String(20),
        nullable=False,
        server_default="staff",
    )
    is_active = db.Column(
        db.Boolean,
        nullable=False,
        server_default=db.true(),
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        server_default=db.func.now(),
    )

    __table_args__ = (
        db.CheckConstraint(
            "role IN ('admin', 'staff')",
            name="ck_staff_role",
        ),
        db.CheckConstraint(
            "length(trim(username)) > 0",
            name="ck_staff_username_not_blank",
        ),
        db.CheckConstraint(
            "length(trim(display_name)) > 0",
            name="ck_staff_display_name_not_blank",
        ),
    )

    def set_password(self, password):
        self.password_hash = generate_password_hash(
            password,
            method="pbkdf2:sha256:1000000",
        )
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    

class RegistrationConfirmation(db.Model):
    """Only created after an authenticated nurse verifies identity on this device."""
    __tablename__ = 'registration_confirmations'

    id = db.Column(db.String(36), primary_key=True)
    payload_digest = db.Column(db.String(64), nullable=False)
    visit_id = db.Column(db.String(36), db.ForeignKey('visits.id', ondelete='RESTRICT'), nullable=False, index=True)
    confirmed_by = db.Column(db.String(36), db.ForeignKey('staff_users.id', ondelete='RESTRICT'), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=db.func.now())
    ended_at = db.Column(db.DateTime(timezone=True), nullable=True)


class VisitSummary(db.Model):
    """A versioned snapshot of answers explicitly confirmed by the patient."""
    __tablename__ = 'visit_summaries'

    id = db.Column(db.String(36), primary_key=True, default=new_id)
    request_id = db.Column(db.String(36), nullable=False)
    visit_id = db.Column(db.String(36), db.ForeignKey('visits.id', ondelete='RESTRICT'), nullable=False, index=True)
    version = db.Column(db.Integer, nullable=False)
    answers = db.Column(db.JSON, nullable=False)
    confirmed_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=db.func.now())
    __table_args__ = (
        db.UniqueConstraint('request_id', name='uq_summary_request_id'),
        db.UniqueConstraint('visit_id', 'version', name='uq_visit_summary_version'),
        db.CheckConstraint('version > 0', name='ck_summary_positive_version'),
    )
