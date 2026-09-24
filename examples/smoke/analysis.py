"""Small synthetic fixture for account validation; no external dependencies."""
import csv
import json
from pathlib import Path


def summarize(path):
    with Path(path).open(newline='') as source:
        values = [float(row['value']) for row in csv.DictReader(source)]
    return {'n': len(values), 'mean': sum(values) / len(values)}


if __name__ == '__main__':
    result = summarize(Path(__file__).with_name('input.csv'))
    print(json.dumps(result))
