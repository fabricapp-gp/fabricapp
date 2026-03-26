import sys
import os

backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'api-server')
sys.path.append(backend_dir)

from main import app
