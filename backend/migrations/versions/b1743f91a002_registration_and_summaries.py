"""Add nurse registration confirmations and patient-confirmed summary versions.

Revision ID: b1743f91a002
Revises: 516295edb660
"""
from alembic import op
import sqlalchemy as sa

revision = 'b1743f91a002'
down_revision = '516295edb660'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('registration_confirmations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('payload_digest', sa.String(64), nullable=False),
        sa.Column('visit_id', sa.String(36), sa.ForeignKey('visits.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('confirmed_by', sa.String(36), sa.ForeignKey('staff_users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_registration_confirmations_visit_id', 'registration_confirmations', ['visit_id'])
    op.create_table('visit_summaries',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('request_id', sa.String(36), nullable=False),
        sa.Column('visit_id', sa.String(36), sa.ForeignKey('visits.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('version', sa.Integer, nullable=False),
        sa.Column('answers', sa.JSON, nullable=False),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('request_id', name='uq_summary_request_id'),
        sa.UniqueConstraint('visit_id', 'version', name='uq_visit_summary_version'),
        sa.CheckConstraint('version > 0', name='ck_summary_positive_version'),
    )
    op.create_index('ix_visit_summaries_visit_id', 'visit_summaries', ['visit_id'])


def downgrade():
    op.drop_table('visit_summaries')
    op.drop_table('registration_confirmations')
