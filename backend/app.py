import os
from pathlib import Path
from auth import init_auth
from dotenv import load_dotenv
from flask import Flask, jsonify
from extensions import db, migrate
import models
from sqlalchemy import URL, text
from sqlalchemy.exc import SQLAlchemyError

load_dotenv(Path(__file__).with_name(".env"))

app = Flask(__name__)

app.config["SECRET_KEY"] = os.environ["SECRET_KEY"]
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

app.config["SQLALCHEMY_DATABASE_URI"] = URL.create(
    drivername="postgresql+psycopg",
    username=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    host=os.environ["DB_HOST"],
    port=int(os.environ["DB_PORT"]),
    database=os.environ["DB_NAME"],
)

app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_pre_ping": True,
    "connect_args": {"connect_timeout": 5},
}

db.init_app(app)
migrate.init_app(app, db)
init_auth(app)


@app.get("/health")
def health():
    return jsonify(
        status="ok",
        message="Signova backend is running",
    )


@app.get("/health/db")
def database_health():
    try:
        with db.engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return jsonify(status="ok", database="connected")

    except SQLAlchemyError:
        return jsonify(
            status="error",
            database="connection failed",
        ), 503