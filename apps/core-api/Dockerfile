# Step 1: Choose base image
# We use the official Bun image, which is optimized and contains everything we need.
FROM oven/bun:1.2

# Step 2: Set the working directory inside the container
# All subsequent commands will be executed in this directory.
WORKDIR /usr/src/app

# Step 3: Optimize dependency caching
# Copy only the files that define dependencies. Docker will cache this step.
# If you don't change dependencies, Docker will use the cache, which drastically speeds up the build.
# Paths are relative to the build context, which will be the monorepo root folder.
COPY ./apps/core-api/package.json ./
RUN bun install

# Step 4: Copy application source code
# This step is performed only after installing dependencies.
COPY ./apps/core-api/ ./

# Step 5: Expose port
# We inform Docker that the application inside the container will listen on port 3000.
EXPOSE 3000

# Step 6: Define the startup command
# This command will be executed when the container is started.
CMD [ "bun", "run", "src/index.ts" ]