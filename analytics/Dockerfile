FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY event_spec.json ./event_spec.json
COPY analytics ./analytics

ENV PYTHONUNBUFFERED=1
ENV TZ=Asia/Ho_Chi_Minh

CMD ["sh", "-c", "while true; do python -m analytics.run --job all --since 2d; sleep 3600; done"]
