FROM python:3.10.4-buster

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000 8001

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "health_project.wsgi:application"]