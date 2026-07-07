"""
Static-files storage for the project.

CompressedManifestStaticFilesStorage does not rewrite ES-module relative
imports (import './state.js') to their hashed filenames by default, which
404s every tracker module in production. Enabling Django's JS-module
import aggregation support fixes that.
"""
from whitenoise.storage import CompressedManifestStaticFilesStorage


class ModuleAwareStaticStorage(CompressedManifestStaticFilesStorage):
    """Manifest storage that also hashes ES-module import specifiers."""

    support_js_module_import_aggregation = True
