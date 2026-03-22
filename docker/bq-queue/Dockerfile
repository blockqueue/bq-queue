FROM node:24-slim
# Using slim instead of alpine to get around this error
# Error: Error relocating /usr/app/node_modules/@libsql/linux-x64-musl/index.node: fcntl64: symbol not found

WORKDIR /app
COPY . .
RUN npm install

CMD [ "npm", "run", "dev", "-w", "queue-service" ]
