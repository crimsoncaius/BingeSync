import pytest
from fastapi.testclient import TestClient

from app.main import JOIN_CODES, SESSIONS, _sse_consumers, app


@pytest.fixture(autouse=True)
def reset_store() -> None:
    SESSIONS.clear()
    JOIN_CODES.clear()
    _sse_consumers.clear()
    yield
    SESSIONS.clear()
    JOIN_CODES.clear()
    _sse_consumers.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
