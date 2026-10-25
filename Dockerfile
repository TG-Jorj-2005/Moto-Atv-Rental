FROM node:22-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate && npm run build
EXPOSE 3000
# Refuse to start with the placeholder secrets of .env.example.
CMD ["sh", "-c", "if [ \"$AUTH_SECRET\" = change-me ] || [ ${#AUTH_SECRET} -lt 16 ]; then echo 'AUTH_SECRET must be set to a random value of at least 16 characters (openssl rand -base64 32)'; exit 1; fi; if [ \"$ADMIN_PASSWORD\" = change-me ]; then echo 'ADMIN_PASSWORD must be changed from the placeholder'; exit 1; fi; npx prisma migrate deploy && npx prisma db seed && npm start"]
