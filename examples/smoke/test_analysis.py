import unittest
from pathlib import Path
from analysis import summarize


class SyntheticAnalysisTest(unittest.TestCase):
    def test_known_result(self):
        self.assertEqual(summarize(Path(__file__).with_name('input.csv')), {'n': 3, 'mean': 20.0})


if __name__ == '__main__':
    unittest.main()
