import { spawn } from 'child_process';
import { split, map, readArray } from 'event-stream';
import { MAVEN_OPTIONS, MavenOptions } from './maven-options';
import { ResolvedOptions } from './resolved-options';
import { dependencyStream } from './dependency-stream';
import { pomStream } from './pom-stream';
import { licenseStream } from './license-stream';
import { logStream } from './log-stream';
import { repoDbStream } from './repodb-stream';
import { Dependency } from './dependency';
import { report } from './report';
import { green, underline } from 'colors';
import { mvn } from './utils';
import { updateScope } from './updateScope';
function _runGoal(options: MavenOptions) {

  new ResolvedOptions(options, (err, opts) => {
    if (err) {
      console.error(err.message);
      process.exit(-1);
      return;
    }

    spawn(mvn, opts.args)
      .stdout
      .on('end', () => {
        opts.repoDb.find({}, (_err: Error, docs: Dependency[]) => {
          if (_err) {
            opts.log.write(_err.message);
          }
          console.log(`Updating ${docs.length} dependencies`);
          readArray(docs)
            .pipe(map(licenseStream(opts)))
            .pipe(map(repoDbStream(opts)))
            .pipe(map(logStream(opts)))
            .on('end', () => {
              updateScope(opts, (opts2) => {
                opts.repoDb.persistence.compactDatafile();
                (opts.repoDb as any).on('compaction.done', () => {
                  report(opts, () => {
                    opts.log.close();
                    console.log(`${green('( done )')}: ${underline(opts.reportPath)}`);
                    process.exit(0);
                  });
                });
              });
            })
            .pipe(process.stdout);
        });
      })
      .pipe(split())
      .pipe(map(dependencyStream(opts)))
      .pipe(map(pomStream(opts)))
      .pipe(map(licenseStream(opts)))
      .pipe(map(repoDbStream(opts)))
      .pipe(map(logStream(opts)))
      .pipe(process.stdout);
  });
}

export function audit(options?: MavenOptions) {
  _runGoal({ ...MAVEN_OPTIONS, ...options });
}
