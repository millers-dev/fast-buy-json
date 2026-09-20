"""
Auth utilities for FastBuyJSON Python implementation

This module provides JWT and certificate-based authentication utilities.
"""

import hashlib
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from fastapi import Depends, HTTPException, status, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from jose import jwt, JWTError

# For demo purposes, we use hardcoded secrets
# In production, these should be stored securely and loaded from environment variables
JWT_SECRET = "fastbuyjson-demo-secret-key-change-in-production"
JWT_REFRESH_SECRET = "fastbuyjson-demo-refresh-secret-key-change-in-production"
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_IN = 3600  # 1 hour in seconds
JWT_REFRESH_EXPIRES_IN = 7 * 24 * 3600  # 7 days in seconds

# Security scheme for JWT auth
security = HTTPBearer()

# Mock user database
USERS = [
    {
        "id": "user1",
        "username": "demo",
        "password": "password123",  # In production, store hashed passwords only
        "email": "demo@example.com",
        "roles": ["customer"],
    },
    {
        "id": "user2",
        "username": "admin",
        "password": "admin123",
        "email": "admin@example.com",
        "roles": ["admin", "customer"],
    },
]

# Store for refresh tokens (in production, use a database)
REFRESH_TOKENS = {}

# Store for certificate sessions
CERTIFICATE_SESSIONS = {}


class TokenData(BaseModel):
    """Token data model"""
    sub: str
    username: Optional[str] = None
    email: Optional[str] = None
    roles: List[str] = []
    exp: Optional[int] = None


def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Authenticate a user with username and password"""
    # Find user by username
    user = next((u for u in USERS if u["username"] == username), None)
    
    # Check if user exists and password matches
    if not user or user["password"] != password:
        return None
    
    # Return user without password
    return {k: v for k, v in user.items() if k != "password"}


def create_access_token(data: Dict[str, Any]) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(seconds=JWT_EXPIRES_IN)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    """Create a JWT refresh token"""
    # Create payload with user ID only
    payload = {"sub": user_id}
    expire = datetime.utcnow() + timedelta(seconds=JWT_REFRESH_EXPIRES_IN)
    payload.update({"exp": expire})
    
    # Generate token
    token = jwt.encode(payload, JWT_REFRESH_SECRET, algorithm=JWT_ALGORITHM)
    
    # Store token
    REFRESH_TOKENS[token] = {
        "user_id": user_id,
        "expires_at": expire
    }
    
    return token


def verify_token(token: str) -> Optional[TokenData]:
    """Verify a JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        token_data = TokenData(**payload)
        return token_data
    except jwt.PyJWTError:
        return None


def refresh_access_token(refresh_token: str) -> Optional[Dict[str, Any]]:
    """Refresh an access token using a refresh token"""
    # Check if refresh token exists in store
    if refresh_token not in REFRESH_TOKENS:
        return None
    
    # Check if token is expired
    token_data = REFRESH_TOKENS[refresh_token]
    if datetime.utcnow() > token_data["expires_at"]:
        del REFRESH_TOKENS[refresh_token]
        return None
    
    try:
        # Verify refresh token
        payload = jwt.decode(
            refresh_token, JWT_REFRESH_SECRET, algorithms=[JWT_ALGORITHM]
        )
        user_id = payload.get("sub")
        
        # Find user
        user = next((u for u in USERS if u["id"] == user_id), None)
        if not user:
            return None
        
        # Generate new access token
        user_data = {
            "sub": user["id"],
            "username": user["username"],
            "email": user["email"],
            "roles": user["roles"]
        }
        
        access_token = create_access_token(user_data)
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": JWT_EXPIRES_IN
        }
        
    except jwt.PyJWTError:
        # Invalid token
        if refresh_token in REFRESH_TOKENS:
            del REFRESH_TOKENS[refresh_token]
        return None


def verify_certificate(certificate_pem: str) -> Optional[Dict[str, Any]]:
    """Verify a client certificate"""
    try:
        # In a real implementation, you would:
        # 1. Validate the certificate against a CA
        # 2. Check certificate revocation status
        # 3. Verify certificate attributes
        
        # For demo purposes, we just check if it's a valid PEM-like string
        if not (
            certificate_pem.startswith("-----BEGIN CERTIFICATE-----") and
            certificate_pem.endswith("-----END CERTIFICATE-----")
        ):
            return None
        
        # Create a session ID
        session_id = str(uuid.uuid4())
        
        # Calculate certificate fingerprint
        fingerprint = hashlib.sha256(certificate_pem.encode()).hexdigest()
        
        # Store session (in production, use a database)
        expires_at = datetime.utcnow() + timedelta(hours=24)
        CERTIFICATE_SESSIONS[session_id] = {
            "certificate_fingerprint": fingerprint,
            "expires_at": expires_at
        }
        
        return {
            "session_id": session_id,
            "expires_in": 24 * 3600  # 24 hours in seconds
        }
    
    except Exception:
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict[str, Any]:
    """Get current user from JWT token"""
    token = credentials.credentials
    token_data = verify_token(token)
    
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = next((u for u in USERS if u["id"] == token_data.sub), None)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Return user without password
    return {k: v for k, v in user.items() if k != "password"}
