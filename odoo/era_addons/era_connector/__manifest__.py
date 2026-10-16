{
    "name": "ERA Connector Foundation",
    "summary": "Safe integration boundary for future ERA services",
    "version": "18.0.1.0.0",
    "category": "Tools",
    "author": "ERA Technology",
    "license": "AGPL-3",
    "depends": ["base"],
    "post_init_hook": "post_init_hook",
    "data": ["security/ir.model.access.csv", "views/era_integration_system_views.xml"],
    "installable": True,
    "application": False,
}
