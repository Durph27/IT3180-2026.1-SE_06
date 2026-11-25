FROM eclipse-temurin:21-jdk-jammy AS build

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ backend/
COPY docs/api/openapi.json docs/api/openapi.json

RUN sed -i 's/\r$//' backend/mvnw \
    && chmod +x backend/mvnw

WORKDIR /workspace/backend

RUN ./mvnw -B -DskipTests package


FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 app

WORKDIR /app

COPY --from=build \
    /workspace/backend/target/backend-0.0.1-SNAPSHOT.jar \
    /app/app.jar

ENV SERVER_PORT=10000 \
    SERVER_ADDRESS=0.0.0.0 \
    PDF_FONT_PATH=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
    JAVA_TOOL_OPTIONS="-Xms64m -Xmx256m -Xss512k -XX:ReservedCodeCacheSize=48m"

USER 10001

EXPOSE 10000

ENTRYPOINT ["java", "-jar", "/app/app.jar"]