import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def run(*args, cwd=None, env=None):
    return subprocess.run(args, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)


class DistributionTests(unittest.TestCase):
    def test_build_matches_committed_bundle(self):
        bundle = ROOT / 'extension/launcher.js'
        before = hashlib.sha256(bundle.read_bytes()).digest()
        result = run(sys.executable, str(ROOT / 'scripts/build.py'))
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(before, hashlib.sha256(bundle.read_bytes()).digest())
        manifest = json.loads((ROOT / 'extension/manifest.json').read_text())
        self.assertIn('helper ' + manifest['version'], bundle.read_text())
        with zipfile.ZipFile(ROOT / 'dist/农耕战斗助手.zip') as archive:
            self.assertEqual(len(archive.namelist()), 10)
            for name in archive.namelist():
                self.assertEqual(archive.read(name), (ROOT / 'extension' / Path(name).name).read_bytes())


@unittest.skipUnless(shutil.which('node'), 'Node.js is required for combat regression checks')
class CombatTests(unittest.TestCase):
    def test_combat_regressions(self):
        for name in ('test-browser-keyboard.cjs', 'test-battle-planner.cjs', 'test-page-combat.cjs', 'test-combat-perks.cjs', 'test-combat-goal.cjs', 'test-combat-return.cjs', 'test-battle-report.cjs'):
            with self.subTest(suite=name):
                result = run('node', str(ROOT / 'tests' / name), cwd=ROOT)
                self.assertEqual(result.returncode, 0, result.stdout)


@unittest.skipUnless(shutil.which('node'), 'Node.js is required for economic regression checks')
class EconomyTests(unittest.TestCase):
    def test_economic_regressions(self):
        for name in ('test-farm-rules.cjs', 'test-farm-automation.cjs', 'test-workshop.cjs',
                     'test-fishing.cjs', 'test-juice.cjs', 'test-jam.cjs', 'test-earnings-progress.cjs', 'test-reward-mult.cjs',
                     'test-multi-worker.cjs', 'test-market.cjs', 'test-compatibility.cjs', 'test-version-guard.cjs', 'test-panel-layout.cjs'):
            with self.subTest(suite=name):
                result = run('node', str(ROOT / 'tests' / name), cwd=ROOT)
                self.assertEqual(result.returncode, 0, result.stdout)


class UpdaterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='farm updater ')
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.origin = self.base / 'origin'
        self.checkout = self.base / 'checkout with spaces'
        self.git = shutil.which('git')
        self.ok('init', '-b', 'main', str(self.origin), cwd=self.base)
        self.identity(self.origin)
        (self.origin / 'version.txt').write_text('old')
        shutil.copy2(ROOT / '更新助手.command', self.origin / '更新助手.command')
        self.commit(self.origin)
        self.ok('clone', str(self.origin), str(self.checkout), cwd=self.base)
        self.identity(self.checkout)
        # Local fixture only: report the expected remote URL, while Git still
        # fetches from the isolated local repository. No network or credentials.
        bin_dir = self.base / 'bin'
        bin_dir.mkdir()
        wrapper = bin_dir / 'git'
        import shlex
        wrapper.write_text('#!/bin/sh\nif [ "$1" = remote ] && [ "$2" = get-url ]; then\n'
                           'printf "%s\\n" https://github.com/Gintma/Farm-assistant.git\n'
                           'else\nexec ' + shlex.quote(self.git) + ' "$@"\nfi\n')
        wrapper.chmod(0o755)
        self.env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ['PATH'])

    def ok(self, *args, cwd):
        result = run(self.git, *args, cwd=cwd)
        self.assertEqual(result.returncode, 0, result.stdout)
        return result.stdout.strip()

    def identity(self, path):
        self.ok('config', 'user.name', 'Fixture', cwd=path)
        self.ok('config', 'user.email', 'fixture@example.invalid', cwd=path)
        self.ok('config', 'commit.gpgsign', 'false', cwd=path)

    def commit(self, path):
        self.ok('add', '.', cwd=path)
        self.ok('commit', '-m', 'fixture', cwd=path)

    def update(self):
        return run('sh', str(self.checkout / '更新助手.command'), cwd=self.base, env=self.env)

    def test_fast_forward_and_repeat(self):
        (self.origin / 'version.txt').write_text('new')
        self.commit(self.origin)
        self.assertEqual(self.update().returncode, 0)
        self.assertEqual((self.checkout / 'version.txt').read_text(), 'new')
        self.assertEqual(self.update().returncode, 0)

    def test_dirty_files_preserved(self):
        (self.checkout / 'version.txt').write_text('local edit')
        self.assertNotEqual(self.update().returncode, 0)
        self.assertEqual((self.checkout / 'version.txt').read_text(), 'local edit')

    def test_wrong_branch_stops(self):
        self.ok('checkout', '-b', 'work', cwd=self.checkout)
        self.assertNotEqual(self.update().returncode, 0)

    def test_divergence_preserves_commit(self):
        (self.checkout / 'version.txt').write_text('local commit')
        self.commit(self.checkout)
        head = self.ok('rev-parse', 'HEAD', cwd=self.checkout)
        (self.origin / 'version.txt').write_text('remote commit')
        self.commit(self.origin)
        self.assertNotEqual(self.update().returncode, 0)
        self.assertEqual(self.ok('rev-parse', 'HEAD', cwd=self.checkout), head)
        self.assertEqual((self.checkout / 'version.txt').read_text(), 'local commit')

    def test_unexpected_remote_stops(self):
        result = run('sh', str(self.checkout / '更新助手.command'), cwd=self.base)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('仓库地址', result.stdout)
