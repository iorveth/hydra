import {
  BaseModel,
  Model,
  StringField,
  NumericField,
  JSONField,
  IntField,
  BooleanField,
  JsonObject,
  Fields,
  WarthogField,
} from 'warthog'
import { Field } from 'type-graphql'
import { SubstrateEvent } from '../substrate-event/substrate-event.model'
import * as BN from 'bn.js'
import { NumericTransformer } from '@dzlzv/hydra-indexer-lib/lib/db/transformers'
import { OneToOne, Column } from 'typeorm'
import { GraphQLBigNumber } from '../../types/scalars'

export interface ExtrinsicArg {
  type: string
  name: string
  value: JsonObject
}

@Model({ db: { name: 'substrate_extrinsic' } })
export class SubstrateExtrinsic extends BaseModel {
  @Field(() => GraphQLBigNumber)
  @WarthogField('numeric')
  @Column({ type: 'numeric', transformer: new NumericTransformer() })
  tip!: BN

  @IntField()
  blockNumber!: number

  @StringField()
  versionInfo!: string

  @JSONField()
  meta!: JsonObject

  @StringField()
  method!: string

  @StringField()
  section!: string

  @JSONField()
  args!: ExtrinsicArg[]

  @StringField()
  signer!: string

  @StringField()
  signature!: string

  @IntField()
  nonce!: number

  @JSONField()
  era!: JsonObject

  @StringField()
  hash!: string

  @BooleanField()
  isSigned!: boolean

  @OneToOne(
    () => SubstrateEvent,
    (event: SubstrateEvent) => event.extrinsic
  ) // specify inverse side as a second parameter
  event!: SubstrateEvent
}
