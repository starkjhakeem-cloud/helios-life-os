from fastapi import APIRouter, HTTPException, status

from app.core.user_store import user_store
from app.schemas.auth import AuthResponse, LoginRequest, SignupRequest, UserOut

router = APIRouter()


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest) -> AuthResponse:
    try:
        user = user_store.create(payload.name, payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return AuthResponse(
        user=UserOut(id=user["id"], name=user["name"], email=user["email"]),
        message="Account created successfully.",
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest) -> AuthResponse:
    user = user_store.authenticate(payload.email, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    return AuthResponse(
        user=UserOut(id=user["id"], name=user["name"], email=user["email"]),
        message="Login successful.",
    )
