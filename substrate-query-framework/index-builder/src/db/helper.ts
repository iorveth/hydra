import * as shortid from 'shortid';
import { DeepPartial, createConnection, QueryRunner, Connection, getConnection } from 'typeorm';

import config from './ormconfig';

import Debug from 'debug';

const debug = Debug('index-builder:helper');

/**
 * Fixes compatibility between typeorm and warthog models.
 *
 * @tutorial Warthog add extra properties to its BaseModel and some of these properties are
 * required. This function mutate the entity to make it compatible with warthog models.
 * Warthog throw error if required properties contains null values.
 *
 * @param entity: DeepPartial<T>
 */
export function fillRequiredWarthogFields<T>(entity: DeepPartial<T>): DeepPartial<T> {
  // Modifying an existing entity so do not add warthog fields
  // eslint-disable-next-line no-prototype-builtins
  if (entity.hasOwnProperty('id')) return entity;

  const requiredFields = {
    id: shortid.generate(),
    createdById: shortid.generate(),
    version: 1,
  };
  return Object.assign(entity, requiredFields);
}

export async function createDBConnection(entities: any[] = []): Promise<Connection> {
  //const connectionOptions = await getConnectionOptions();
  const _config = config();
  entities.map((e) => _config.entities?.push(e));
  debug(`DB config: ${JSON.stringify(_config, null, 2)}`);
  return createConnection(_config);
}


export async function doInTransaction<T>(fn: (qn: QueryRunner) => Promise<T>): Promise<T> {
  const queryRunner = getConnection().createQueryRunner();
  try {
    // establish real database connection
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    const result = await fn(queryRunner);

    await queryRunner.commitTransaction();
    
    return result;
  } catch (error) {
    console.error(`Rolling back the transaction due to errors: ${JSON.stringify(error, null, 2)}`);

    // Since we have errors lets rollback changes we made
    await queryRunner.rollbackTransaction();
    throw new Error(error);
  } finally {
    // Query runner needs to be released manually.
    await queryRunner.release();
  }
}