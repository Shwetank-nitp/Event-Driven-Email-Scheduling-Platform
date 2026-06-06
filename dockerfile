# ─── Base ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine

# set working directory
WORKDIR /app

# install dependencies first (better layer caching)
COPY package*.json ./

RUN npm install

# copy prisma schema and generate client
COPY prisma ./prisma
COPY generated ./generated

RUN npx prisma generate

# copy rest of source
COPY . .

# create logs directory
RUN mkdir -p logs

# default command — overridden by worker service in docker-compose
CMD ["npm", "run", "dev"]