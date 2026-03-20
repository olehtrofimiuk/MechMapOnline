import uvicorn
if __name__ == "__main__":
    # Configure uvicorn with increased limits for large file uploads (100MB+)
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=False,
        log_level="warning",
        limit_concurrency=None,
        timeout_keep_alive=30
    )