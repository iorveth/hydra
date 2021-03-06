import { QueryNode, QueryNodeState } from '.';
import { Bootstrapper } from '../bootstrap';
import MappingsProcessor from '../processor/MappingsProcessor';
import { IndexerOptions, BootstrapOptions, ProcessorOptions } from './QueryNodeStartOptions';
import { createDBConnection } from '../db/helper';
import { Connection } from 'typeorm';
import Debug from 'debug';


const debug = Debug('index-builder:producer');

// Respondible for creating, starting up and shutting down the query node.
// Currently this class is a bit thin, but it will almost certainly grow
// as the integration logic between the library types and the application
// evolves, and that will pay abstraction overhead off in terms of testability of otherwise
// anonymous code in root file scope.
export class QueryNodeManager {
  private _query_node!: QueryNode;

  constructor() {
    // TODO: a bit hacky, but okay for now
    debug(`Hydra indexer lib version: ${process.env.npm_package_dependencies__dzlzv_hydra_indexer_lib || 'UNKNOWN'}`);
    // Hook into application
    process.on('exit', () => this._onProcessExit());
  }

  /**
   * Starts the indexer
   * 
   * @param options options passed to create the indexer service
   */
  async index(options: IndexerOptions): Promise<void> {
    if (this._query_node) throw Error('Cannot start the same manager multiple times.');
    await createDBConnection();

    this._query_node = await QueryNode.create(options);
    await this._query_node.start();
  }

  async bootstrap(options: BootstrapOptions): Promise<void> {
    const bootstrapper = await Bootstrapper.create(options);
    await bootstrapper.bootstrap();
  }


  /**
   * Starts the mappings processor
   * 
   * @param options options passed to create the mappings
   */
  async process(options: ProcessorOptions): Promise<void> {
    const extraEntities = options.entities ? options.entities : [];
    await createDBConnection(extraEntities);
    
    const processor =  MappingsProcessor.create(options);
    await processor.start();
  }

  /**
   * Run migrations in the "migrations" folder;
   */
  async migrate(): Promise<void> {
    let connection: Connection | undefined;
    try {
      connection = await createDBConnection();
      if (connection)
        await connection.runMigrations();
    } finally {
      if (connection)
        await connection.close();
    }
  }


   _onProcessExit(): void  {
    // Stop if query node has been constructed and started.
    if (this._query_node && this._query_node.state == QueryNodeState.STARTED) {
      // we can't to better as the process is exiting, so leaving the promise floating
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this._query_node.stop();
    }
   }
}
