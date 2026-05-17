import os
import secrets
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

security = HTTPBasic()

APP_USERNAME = "admin"


def get_current_user(credentials: HTTPBasicCredentials = Depends(security)):
    app_password = os.getenv("APP_PASSWORD", "changeme")
    username_ok = secrets.compare_digest(credentials.username.encode(), APP_USERNAME.encode())
    password_ok = secrets.compare_digest(credentials.password.encode(), app_password.encode())
    if not (username_ok and password_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username
