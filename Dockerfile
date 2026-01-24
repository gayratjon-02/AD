FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

RUN mkdir -p uploads

EXPOSE 5032

CMD ["npm", "run", "start:prod"]