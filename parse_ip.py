import sys
import re

idx = 0;
for line in sys.stdin:
    if idx == 4:
        print(line.split(" ")[1], end="")
    idx += 1
