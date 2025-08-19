FROM public.ecr.aws/docker/library/node:20-alpine
WORKDIR /app

COPY dist/server-s3.js ./server-s3.js

EXPOSE 3000
ENV NODE_ENV=production
ENV WITH_S3=true
ENV PORT=3000
CMD ["node","server-s3.js"]
