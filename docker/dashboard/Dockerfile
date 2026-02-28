FROM node:alpine3.22

WORKDIR /app
RUN npm install -g @pg-boss/dashboard

ENV PORT=3000
EXPOSE 3000

CMD ["pg-boss-dashboard"]
