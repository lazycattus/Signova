from datetime import timedelta
from functools import wraps
from flask import Blueprint, jsonify, request, session,g
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect, CSRFError, generate_csrf
from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db
from models import StaffUser


auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
csrf = CSRFProtect()

# In-memory rate limiting for local development.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="memory://",
)

# Used when an account does not exist, so a password check still runs.
dummy_hash = generate_password_hash(
    "unused-demo-value",
    method="pbkdf2:sha256:1000000",
)


def account_details(user):
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
    }

def staff_required(view):
    @wraps(view)
    def protected_view(*args, **kwargs):
        user_id = session.get("staff_user_id")

        if not user_id:
            return jsonify(error="Please sign in."), 401

        user = db.session.get(StaffUser, user_id)

        if not user or not user.is_active:
            session.pop("staff_user_id", None)
            return jsonify(error="Please sign in."), 401

        if user.role not in ("admin", "staff"):
            return jsonify(error="Access denied."), 403

        g.staff_user = user
        return view(*args, **kwargs)

    return protected_view


@auth_bp.after_request
def prevent_caching(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@auth_bp.get("/csrf")
def csrf_token():
    return jsonify(csrf_token=generate_csrf())


@auth_bp.post("/login")
@limiter.limit("5 per minute")
def login():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify(error="Send a JSON object."), 400

    username = data.get("username")
    password = data.get("password")

    if (
        not isinstance(username, str)
        or not isinstance(password, str)
        or not username.strip()
        or not password
        or len(username) > 80
        or len(password) > 1024
    ):
        return jsonify(error="Enter a valid username and password."), 400

    user = db.session.execute(
        db.select(StaffUser).filter_by(username=username.strip())
    ).scalar_one_or_none()

    password_valid = check_password_hash(
        user.password_hash if user else dummy_hash,
        password,
    )

    if not user or not password_valid or not user.is_active:
        session.pop("staff_user_id", None)
        return jsonify(error="Invalid username or password."), 401

    current_registration = session.get("current_registration")
    session.clear()
    if current_registration:
        session["current_registration"] = current_registration
    session["staff_user_id"] = user.id
    session.permanent = True

    return jsonify(
        message="Login successful.",
        user=account_details(user),
        csrf_token=generate_csrf(),
    )


@auth_bp.get("/me")
def current_account():
    user_id = session.get("staff_user_id")

    if not user_id:
        return jsonify(error="Please sign in."), 401

    user = db.session.get(StaffUser, user_id)

    if not user or not user.is_active:
        session.pop("staff_user_id", None)
        return jsonify(error="Please sign in."), 401

    return jsonify(user=account_details(user))


@auth_bp.post("/logout")
def logout():
    current_registration = session.get("current_registration")
    session.clear()
    if current_registration:
        session["current_registration"] = current_registration
    return jsonify(message="Signed out.")


@auth_bp.get("/nurse-access")
@staff_required
def nurse_access():
    return jsonify(
        message="Nurse access confirmed.",
        user=account_details(g.staff_user),
    )

def init_auth(app):
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(minutes=15)

    csrf.init_app(app)
    limiter.init_app(app)
    app.register_blueprint(auth_bp)

    @app.errorhandler(CSRFError)
    def csrf_failed(error):
        return jsonify(
            error="Your form expired. Reload it and try again."
        ), 400

    @app.errorhandler(429)
    def too_many_attempts(error):
        return jsonify(
            error="Too many attempts. Please wait a minute."
        ), 429