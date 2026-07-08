---
name: fastapi-best-practices
description: Reference for FastAPI API design best practices. Use when designing new endpoints, reviewing routes, or making architectural decisions about the API.
---

# FastAPI API Design Best Practices

## Versioning

- Prefix all routes with a version: `/api/v1/...`
- Use URL-based versioning (not header-based) for simplicity and discoverability
- When introducing breaking changes, create a new version (`/api/v2/...`) while keeping the old one available

## Pagination

- All list endpoints must support pagination
- Use query params: `?page=1&page_size=20`
- Set a default page size (e.g., 20) and a max page size (e.g., 100)
- Return pagination metadata in the response:
  ```json
  {
    "items": [...],
    "total": 150,
    "page": 1,
    "page_size": 20,
    "total_pages": 8
  }
  ```

## Filtering & Sorting

- Use query parameters for filtering: `?status=active&priority=high`
- Use a `sort` query parameter: `?sort=created_at:desc`
- Support multiple sort fields: `?sort=priority:desc,created_at:asc`

## HTTP Methods & Status Codes

- `POST` for creation -> `201 Created`
- `GET` for retrieval -> `200 OK`
- `PUT` for full update -> `200 OK`
- `PATCH` for partial update -> `200 OK`
- `DELETE` for deletion -> `204 No Content`
- Return `404 Not Found` for missing resources
- Return `422 Unprocessable Entity` for validation errors (FastAPI default)
- Return `409 Conflict` for duplicate resources

## Request/Response Design

- Use plural nouns for resource names: `/projects/`, `/users/`
- Bulk operations: all CRUD endpoints accept and return lists
- Use Pydantic schemas for all input and output
- Services return `*Result` schemas, never SQLAlchemy entities
- Input schemas: `Create*`, `Update*`
- Output schemas: `*Result`

## Error Handling

- Use a consistent error response format:
  ```json
  {
    "detail": "Human-readable error message",
    "code": "MACHINE_READABLE_CODE"
  }
  ```
- Use FastAPI exception handlers for global error formatting
- Catch domain-specific exceptions in the service layer
- Never expose internal errors (DB errors, tracebacks) to the client

## Authentication & Authorization

- Use dependency injection for auth: `current_user: User = Depends(get_current_user)`
- Separate authentication (who are you?) from authorization (what can you do?)
- Apply authorization at the route level using dependencies

## Naming Conventions

- Route paths: lowercase, kebab-case for multi-word (`/project-items/`)
- Schema classes: PascalCase (`CreateProject`, `ProjectResult`)
- Route functions: snake_case (`create_project`, `get_projects`)
- Query params: snake_case (`page_size`, `sort_by`)

## Performance

- Use async endpoints for I/O-bound operations
- Use `select_in_loading` or `joinedload` to avoid N+1 queries
- Add database indexes on frequently filtered/sorted columns
- Use connection pooling (SQLAlchemy default with `create_engine`)

## Documentation

- FastAPI auto-generates OpenAPI docs — keep them useful
- Add `summary` and `description` to route decorators for complex endpoints
- Group endpoints with `tags` on the router
- Use `response_model` on every endpoint for automatic serialization and docs
