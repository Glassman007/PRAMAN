"""Reuse the validated placement engine over all active records."""
import sys
from build_pilot import main
if '--all' not in sys.argv:sys.argv.append('--all')
if __name__=='__main__':main()
