@echo off
REM Reset the CrewNest DEV database then seed fresh demo data.
REM Refuses to touch anything but a local development SQLite database.
python -m backend.reset_db --yes
python -m backend.seed_demo
