#!/bin/sh
set -e

echo "Running migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting gunicorn..."
exec gunicorn --bind 0.0.0.0:8000 --workers 3 --access-logfile - sportsman.wsgi:application
