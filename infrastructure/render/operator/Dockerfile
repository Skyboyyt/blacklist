FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
WORKDIR /app
RUN chown node:node /app
COPY --chown=node:node . .
USER node
# Optional public trust bundle for intercepted development networks; never a credential.
ARG NODE_EXTRA_CA_CERTS
RUN node infrastructure/render/build.mjs api
ENV NODE_ENV=production
CMD ["node", "infrastructure/render/operator/main.ts"]
