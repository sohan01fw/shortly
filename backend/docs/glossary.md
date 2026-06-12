# Domain Glossary

## Original URL

The canonical HTTP or HTTPS destination stored for a Short Code.

## Short Code

The exactly seven-character Base62 identifier assigned to an Original URL.

## Short URL

The public URL formed by appending a Short Code to the configured public base
URL.

## Creation Server

The independently runnable Bun process that creates or reuses Short URLs.

## Redirect Server

The independently runnable Bun process that resolves Short Codes and redirects
clients to Original URLs.

## Cache Hit

A redirect lookup answered from Redis without querying PostgreSQL.

## Cache Miss

A redirect lookup that Redis cannot answer and must continue to PostgreSQL.
