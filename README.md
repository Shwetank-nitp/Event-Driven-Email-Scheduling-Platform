# Event-Driven Email Scheduling Platform

[![Ask DeepWiki](https://devin.ai/assets/askdeepwiki.png)](https://deepwiki.com/Shwetank-nitp/Event-Driven-Email-Scheduling-Platform)

This repository contains a robust, event-driven platform for scheduling, dispatching, and managing email-like messages. The system is built with a microservices-oriented approach, containerized with Docker, and features a comprehensive observability stack with Prometheus, Grafana, and Alertmanager.

## System Architecture

The platform is composed of several interconnected services orchestrated by Docker Compose:

- **API Server (`api`)**: An Express.js application that serves the public-facing API. It handles user registration, authentication (JWT), and endpoints for scheduling new jobs, viewing messages, and managing jobs.
- **Scheduler Worker (`schedulerWorker.ts`)**: A `node-cron` based background job that runs every 30 seconds. It queries the PostgreSQL database for due jobs, marks them as `QUEUED`, and publishes them to a RabbitMQ message queue. It also includes a recovery mechanism for tasks that get stuck in a `PROCESSING` state.
- **Message Dispatch Worker (`worker`)**: A dedicated worker process that consumes jobs from the RabbitMQ `MESSAGE.send` queue. It processes each job by calling a mock email service, handles a retry-and-backoff strategy for transient failures, and sends terminally failed jobs to a Dead-Letter Queue (DLQ).
- **PostgreSQL (`postgres`)**: The primary relational database, managed by Prisma ORM. It stores user data, message jobs, and messages (inbox/sent).
- **Redis (`redis`)**: An in-memory data store used for API response caching (e.g., paginated lists, stats) and for distributed locking to prevent race conditions in the workers.
- **RabbitMQ (`rabbitmq`)**: The message broker that decouples the API from the dispatch worker. It uses a direct exchange and multiple queues (`MESSAGE.send`, `MESSAGE.retry`, `MESSAGE.dlq`) to manage the lifecycle of a message job.
- **Observability Stack**:
  - **Prometheus (`prometheus`)**: Scrapes and stores time-series metrics from both the API server and the message dispatch worker.
  - **Grafana (`grafana`)**: Provides a pre-configured dashboard for visualizing key performance indicators like message throughput, job processing duration, API latency, and worker health.
  - **Alertmanager (`alertmanager`)**: Manages alerts defined in Prometheus (e.g., high API latency, worker down). It is configured to send notifications via email.

## System Architecture

The platform is composed of several interconnected services orchestrated by Docker Compose:

- **API Server (`api`)**: An Express.js application that serves the public-facing API. It handles user registration, authentication (JWT), and endpoints for scheduling new jobs, viewing messages, and managing jobs.
- **Scheduler Worker (`schedulerWorker.ts`)**: A `node-cron` based background job that runs every 30 seconds. It queries the PostgreSQL database for due jobs, marks them as `QUEUED`, and publishes them to a RabbitMQ message queue. It also includes a recovery mechanism for tasks that get stuck in a `PROCESSING` state.
- **Message Dispatch Worker (`worker`)**: A dedicated worker process that consumes jobs from the RabbitMQ `MESSAGE.send` queue. It processes each job by calling a mock email service, handles a retry-and-backoff strategy for transient failures, and sends terminally failed jobs to a Dead-Letter Queue (DLQ).
- **PostgreSQL (`postgres`)**: The primary relational database, managed by Prisma ORM. It stores user data, message jobs, and messages (inbox/sent).
- **Redis (`redis`)**: An in-memory data store used for API response caching (e.g., paginated lists, stats) and for distributed locking to prevent race conditions in the workers.
- **RabbitMQ (`rabbitmq`)**: The message broker that decouples the API from the dispatch worker. It uses a direct exchange and multiple queues (`MESSAGE.send`, `MESSAGE.retry`, `MESSAGE.dlq`) to manage the lifecycle of a message job.
- **Observability Stack**:
  - **Prometheus (`prometheus`)**: Scrapes and stores time-series metrics from both the API server and the message dispatch worker.
  - **Grafana (`grafana`)**: Provides a pre-configured dashboard for visualizing key performance indicators like message throughput, job processing duration, API latency, and worker health.
  - **Alertmanager (`alertmanager`)**: Manages alerts defined in Prometheus (e.g., high API latency, worker down). It is configured to send notifications via email.

_(An architecture diagram outlining these components.)_

<p align="center">
  <img src="architecture.png" alt="System Architecture Diagram" width="800">
</p>

## Features

- **User Authentication**: Secure user registration and login using JWT.
- **Message Scheduling**: API endpoints to schedule messages for future delivery.
- **Reliable Job Processing**: Event-driven architecture using RabbitMQ ensures that jobs are not lost.
- **Robust Error Handling**: Automatic retries for failed jobs with a final Dead-Letter Queue for manual inspection.
- **Performance Caching**: Redis is used to cache API responses for lists, stats, and individual items, reducing database load.
- **Scalability**: The separation of the API, scheduler, and dispatch worker allows each component to be scaled independently.
- **Full Observability**: In-depth monitoring of application and worker metrics with a pre-built Grafana dashboard and alerting.
- **Containerized Environment**: The entire stack is defined in `docker-compose.yml` for easy setup and consistent deployment.
- **API Documentation**: API is documented using OpenAPI 3.0 specs and served via Swagger UI.

## Technology Stack

- **Backend**: Node.js, Express.js, TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Message Broker**: RabbitMQ
- **Caching & Locking**: Redis
- **Containerization**: Docker, Docker Compose
- **Monitoring**: Prometheus, Grafana, Alertmanager
- **Authentication**: JSON Web Tokens (JWT), bcryptjs
- **API Specification**: OpenAPI (Swagger)

## Getting Started

### Prerequisites

- Docker
- Docker Compose

### Installation

1.  **Clone the repository:**

    ```bash
    git clone [https://github.com/shwetank-nitp/Event-Driven-Email-Scheduling-Platform.git](https://github.com/shwetank-nitp/Event-Driven-Email-Scheduling-Platform.git)
    cd Event-Driven-Email-Scheduling-Platform
    ```

2.  **Create an environment file:**
    The application uses a `.env` file for configuration. Create a file named `.env` in the root of the project and populate it with the following variables.

    ```env
    # Application
    NODE_ENV=development
    PORT=8000
    METRICS_PORT=9000
    JOB_MATRICES_SERVER_PORT=9001

    # JWT
    JWT_SECRET=your-super-secret-jwt-key
    JWT_EXPIRES_IN=7d

    # Postgres
    POSTGRES_USER=admin
    POSTGRES_PASSWORD=password
    POSTGRES_DB=scheduler

    # RabbitMQ
    RABBITMQ_USER=guest
    RABBITMQ_PASSWORD=guest
    RABBITMQ_EMAIL_QUEUE=MESSAGE.send
    RABBITMQ_RETRY_QUEUE=MESSAGE.retry
    RABBITMQ_DEAD_LETTER_QUEUE=MESSAGE.dlq

    # Grafana
    GF_PORT=3000
    GF_SECURITY_ADMIN_PASSWORD=admin

    # Prometheus
    PROMETHEUS_PORT=9090

    # Alertmanager (for email alerts)
    HOST_NAME=smtp.gmail.com:587
    SMTP_FROM=your-email@gmail.com
    SMTP_AUTH_USERNAME=your-email@gmail.com
    SMTP_AUTH_PASSWORD=your-gmail-app-password
    SEND_TO_USERNAME=recipient-email@example.com

    # --- LOCAL DEVELOPMENT ONLY ---
    # (Docker constructs and handles these targets automatically within the container network)
    DATABASE_URL=postgresql://admin:password@localhost:5432/scheduler
    REDIS_HOST=localhost
    REDIS_PORT=6379
    ```

3.  **Deploy the stack:**
    The repository includes a `deploy.sh` script to simplify the startup process. It reads the `.env` file, substitutes variables into the Alertmanager config, and starts all underlying background services—including the API server, the scheduler background routine, and the message dispatch workers—simultaneously.

    ```bash
    chmod +x deploy.sh
    ./deploy.sh
    ```

    For a clean start (wipes existing Docker volumes and clears persistent data caches):

    ```bash
    ./deploy.sh --hard-start
    ```

    Alternatively, you can use Docker Compose directly:

    ```bash
    # Note: The deploy.sh script handles substituting env vars for alertmanager.
    # If running manually, you may need to pre-process alertmanager.template.yml.
    docker compose up -d --build
    ```

### Accessing Services

Once the stack is running, the services are available at the following local ports:

- **API Server**: `http://localhost:8000`
- **API Docs (Swagger UI)**: `http://localhost:8000/api/docs`
- **Mock Inbox**: `http://localhost:8000/dev/inbox`
- **Grafana**: `http://localhost:3000` (Login: `admin` / `admin` or your `GF_SECURITY_ADMIN_PASSWORD`)
- **Prometheus**: `http://localhost:9090`
- **Alertmanager**: `http://localhost:9093`
- **RabbitMQ Management**: `http://localhost:15672` (Login: `guest` / `guest` or your `RABBITMQ_USER`/`RABBITMQ_PASSWORD`)
- **API Metrics**: `http://localhost:9000/metrics`
- **Worker Metrics**: `http://localhost:9001/metrics`

## API Endpoints

The API is documented via OpenAPI. A few key endpoints are listed below. All protected routes require a `Bearer` token in the `Authorization` header.

- `POST /api/auth/register`: Register a new user.
- `POST /api/auth/login`: Log in a user and receive a JWT.
- `POST /api/m/schedule`: (Protected) Schedule a new message to be sent.
- `GET /api/m/messages`: (Protected) Get a paginated list of messages or jobs (e.g., `type=jobs`, `type=inbox`).
- `GET /api/m/stats`: (Protected) Get aggregated stats for jobs or messages.
- `POST /api/m/jobs/{id}/cancel`: (Protected) Cancel a `PENDING` scheduled job.
