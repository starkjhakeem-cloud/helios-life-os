from pydantic import BaseModel, Field, field_validator


class SignupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=6)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        normalised = v.strip().lower()
        if "@" not in normalised:
            raise ValueError("Invalid email address.")
        return normalised


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()


class UserOut(BaseModel):
    id: str
    name: str
    email: str


class AuthResponse(BaseModel):
    user: UserOut
    message: str
