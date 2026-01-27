# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./
COPY tsconfig.json ./

# Installer les dépendances
RUN npm ci

# Copier le code source
COPY src ./src
COPY public ./public

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copier seulement les fichiers nécessaires
COPY package*.json ./
RUN npm ci --only=production

# Copier le build depuis le stage précédent
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=8080

# Exposition du port
EXPOSE 8080

# Santé du container
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Lancer l'application
CMD ["node", "dist/index.js"]
