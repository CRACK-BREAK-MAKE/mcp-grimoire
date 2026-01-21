"""News Aggregator v1.5 - SSE Server with API Key Auth.

This server implements API Key authentication over SSE transport.
Domain: News Aggregator - Get latest news, articles, and RSS feeds.
Perfect for staying updated with news from multiple sources.
"""

import os

from fastmcp import FastMCP

from src.common.auth_providers import APIKeyVerifier
from src.common.constants import DEFAULT_API_KEY, PORT_API_KEY_SSE, SERVER_NAME_API_KEY_SSE
from src.common.logging import get_logger, log_startup
from src.common.middleware import add_standard_middleware


# Get module logger
logger = get_logger(__name__)


def create_server() -> FastMCP:
    """Create API Key SSE server.

    Returns:
        Configured FastMCP server with API key auth
    """
    # Get valid API keys from environment or use default
    api_keys_str = os.environ.get("API_KEYS", DEFAULT_API_KEY)
    valid_api_keys = {key.strip() for key in api_keys_str.split(",") if key.strip()}

    # Create API key verifier
    auth = APIKeyVerifier(
        valid_api_keys=valid_api_keys,
        client_id="api-key-sse",
        scopes=["read", "write"],
    )

    # Create FastMCP server with authentication
    mcp = FastMCP(name=SERVER_NAME_API_KEY_SSE, auth=auth)
    
    # Add standard middleware stack (structured logging + optional header logging)
    add_standard_middleware(
        mcp,
        server_prefix="API_KEY_SSE",
        enable_structured_logging=True,
        enable_header_logging=True,  # Enable for debugging auth issues
        include_payloads=False,  # Set to True for detailed debugging
    )

    # Domain: News Aggregator
    @mcp.tool()
    def get_latest_news(category: str = "general", limit: int = 10) -> dict:
        """Fetch latest news articles from multiple sources.

        Args:
            category: News category (general, business, technology, sports, entertainment)
            limit: Maximum number of articles to return (1-50)

        Returns:
            Dictionary with list of news articles and metadata
        """
        from datetime import datetime, timedelta
        import random
        
        valid_categories = ["general", "business", "technology", "sports", "entertainment"]
        if category not in valid_categories:
            return {"error": f"Category must be one of: {', '.join(valid_categories)}", "success": False}
        
        if limit < 1 or limit > 50:
            return {"error": "Limit must be between 1 and 50", "success": False}
        
        sources = ["Reuters", "BBC", "CNN", "TechCrunch", "The Verge", "ESPN"]
        articles = []
        
        for i in range(limit):
            articles.append({
                "id": f"article_{i}_{random.randint(1000, 9999)}",
                "title": f"Breaking: Important {category} news story #{i+1}",
                "source": random.choice(sources),
                "author": f"Reporter {random.choice(['Smith', 'Johnson', 'Williams', 'Brown'])}",
                "published_at": (datetime.utcnow() - timedelta(hours=random.randint(1, 24))).isoformat(),
                "url": f"https://news.example.com/article-{i}",
                "category": category,
                "summary": f"This is a summary of the {category} news article about recent developments..."
            })
        
        return {
            "success": True,
            "category": category,
            "article_count": len(articles),
            "fetched_at": datetime.utcnow().isoformat(),
            "articles": articles
        }

    @mcp.tool()
    def search_news(query: str, from_date: str = None) -> dict:
        """Search news articles by keyword or phrase.

        Args:
            query: Search query string
            from_date: Optional start date in YYYY-MM-DD format

        Returns:
            Dictionary with matching articles and search metadata
        """
        from datetime import datetime, timedelta
        import random
        
        if from_date:
            try:
                datetime.strptime(from_date, "%Y-%m-%d")
            except ValueError:
                return {"error": "Invalid from_date format. Use YYYY-MM-DD", "success": False}
        
        # Simulate search results
        num_results = random.randint(5, 15)
        articles = []
        
        for i in range(num_results):
            articles.append({
                "id": f"search_{i}_{random.randint(1000, 9999)}",
                "title": f"Article about {query} - Story #{i+1}",
                "source": random.choice(["Reuters", "AP News", "Bloomberg"]),
                "published_at": (datetime.utcnow() - timedelta(days=random.randint(0, 30))).isoformat(),
                "relevance_score": round(random.uniform(0.6, 1.0), 2),
                "snippet": f"...{query} has been a trending topic with significant developments...",
                "url": f"https://news.example.com/search/{i}"
            })
        
        # Sort by relevance
        articles.sort(key=lambda x: x["relevance_score"], reverse=True)
        
        return {
            "success": True,
            "query": query,
            "from_date": from_date,
            "results_count": len(articles),
            "searched_at": datetime.utcnow().isoformat(),
            "articles": articles
        }

    @mcp.tool()
    def get_trending_topics() -> dict:
        """Get currently trending news topics and hashtags.

        Returns:
            Dictionary with trending topics, their popularity, and related articles
        """
        from datetime import datetime, timedelta
        import random
        
        topics = [
            "Climate Summit", "Tech Innovation", "Space Exploration", 
            "Economic Update", "Sports Championship", "Entertainment Awards",
            "Political Election", "Health Breakthrough", "Market Trends"
        ]
        
        trending = []
        for topic in random.sample(topics, k=5):
            trending.append({
                "topic": topic,
                "mentions": random.randint(1000, 50000),
                "trend_score": round(random.uniform(70, 100), 1),
                "category": random.choice(["politics", "technology", "sports", "business"]),
                "related_articles": random.randint(10, 100),
                "trending_since": (datetime.utcnow() - timedelta(hours=random.randint(1, 12))).isoformat()
            })
        
        # Sort by trend score
        trending.sort(key=lambda x: x["trend_score"], reverse=True)
        
        return {
            "success": True,
            "trending_count": len(trending),
            "updated_at": datetime.utcnow().isoformat(),
            "trending_topics": trending,
            "refresh_interval_minutes": 15
        }

    return mcp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT_API_KEY_SSE))
    server = create_server()
    
    # Get API keys count for logging
    api_keys_str = os.environ.get("API_KEYS", DEFAULT_API_KEY)
    api_keys_count = len([k for k in api_keys_str.split(",") if k.strip()])
    
    # Use centralized logging for startup
    log_startup(
        logger,
        SERVER_NAME_API_KEY_SSE,
        port,
        api_keys_count=api_keys_count,
        transport="SSE"
    )
    
    server.run(transport="sse", port=port)
