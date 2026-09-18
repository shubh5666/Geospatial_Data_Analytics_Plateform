from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.analytics import router as analytics_router
from app.auth import router as auth_router
from app.config import load_auth_settings, load_cors_settings
from app.projects import router as projects_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Refuse to start with missing signing credentials or invalid token settings.
    app.state.auth_settings = load_auth_settings()
    yield


app = FastAPI(title="Darukaa.Earth API", lifespan=lifespan)
cors_settings = load_cors_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(analytics_router)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    # Pydantic errors can include the raw password, or the entire submitted body.
    details = [
        {key: issue[key] for key in ("type", "loc", "msg")} for issue in error.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": details})


@app.get("/")
def root():
    return {"message": "Darukaa.Earth Backend is running"}
