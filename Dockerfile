FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
ENV PORT=3000
EXPOSE 3000
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
USER node
CMD ["node", "src/server.js"]
