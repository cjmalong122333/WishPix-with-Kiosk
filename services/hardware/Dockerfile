# WishPix hardware service. In Docker it runs in mock mode (pages are saved
# as PNG files); on the Raspberry Pi it runs with systemd and CUPS (deploy/).
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core cups-client && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
ENV PRINTER_MODE=mock STATE_DIR=/app/data
VOLUME /app/data
EXPOSE 8765
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765"]
