FROM node:22-alpine AS deps

WORKDIR /opt/5stack

COPY package.json yarn.lock .yarnrc.yml ./

RUN corepack enable && corepack prepare 

RUN yarn install --immutable

FROM node:22-alpine AS builder

WORKDIR /opt/5stack

COPY --from=deps /opt/5stack/node_modules ./node_modules
COPY . .

RUN corepack enable && corepack prepare

# The theater-mode clip bundle pushes the Vite client build past Node's
# default old-space heap limit inside the container; without this the
# build OOMs partway through.
ENV NODE_OPTIONS=--max-old-space-size=6144
RUN yarn build

FROM node:22-alpine

WORKDIR /opt/5stack

COPY --from=builder /opt/5stack/.output  .

ENV HOST=0.0.0.0
EXPOSE 3000

CMD [ "node", "server/index.mjs" ]