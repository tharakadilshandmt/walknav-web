# WalkNav Database — Pre-configured PostgreSQL + PostGIS
FROM postgis/postgis:16-3.4

# Copy init SQL into docker-entrypoint-initdb.d
# This runs automatically on first container start
COPY init.sql /docker-entrypoint-initdb.d/01-init.sql

# Set default environment
ENV POSTGRES_DB=walknav
ENV POSTGRES_USER=walknav_user
ENV POSTGRES_PASSWORD=walknav_dev_pass

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD pg_isready -U walknav_user -d walknav || exit 1
