import {
  CustomType,
  SharedSlice,
} from "@prismicio/types-internal/lib/customtypes";
import { createClient, createBulkTransaction } from "@prismicio/custom-types-client";
import { Environment, createSliceMachineManager } from "@slicemachine/manager";
import * as fs from "node:fs/promises";

import 'dotenv/config'
import path from "path";

async function main() {

  const token = await getAuthToken()

  console.log(token)

  const client = createClient({
    repositoryName: process.env.REPO,
    token: process.env.CT_API_TOKEN,
    fetchOptions: {
      headers: {
        "User-Agent": "sm-api",
        Authorization: `Bearer ${token}`
      }
    }
  });

  const models = await extractModels()
  console.log(models)

  const bulkTransaction = createBulkTransaction();
  bulkTransaction.fromDiff(
    {
      customTypes: await client.getAllCustomTypes(),
      slices: await client.getAllSharedSlices(),
    },
    {
      customTypes: models.customTypes,
      slices: models.customTypes,
    },
  );

  await client.bulk(bulkTransaction);
}

/**
   * Returns the Prismic content models stored in the Git repository.
   *
   * **Note**: This method only supports the following adapters:
   *
   * - `@slicemachine/adapter-next`
   * - `@slicemachine/adapter-nuxt`
   * - `@slicemachine/adapter-sveltekit`
   *
   * @remarks
   * This method clones the Git repository to a temporary location.
   * @remarks
   * This method currently does not use the project's Slice Machine adapter; we
   * are unable to install adapters in the Lambda function at this time.
   * Instead, it re-implements some of the logic used in our current adapters.
   */

async function extractModels(): Promise<{ slices: SharedSlice[]; customTypes: CustomType[] }> {

  try {
    const manager = createSliceMachineManager({ cwd: process.cwd() });

    const config = await manager.project.getSliceMachineConfig();
    const adapterName = await manager.project.getAdapterName();

    switch (adapterName) {
      case "@slicemachine/adapter-next":
      case "@slicemachine/adapter-nuxt":
      case "@slicemachine/adapter-sveltekit": {
        const customTypes = await readModels<CustomType>({
          path: path.join(process.cwd(), "./customtypes"),
          fileName: "index.json",
        });
        const slices = (
          await Promise.all(
            (config.libraries || []).map(async (library) => {
              return await readModels<SharedSlice>({
                path: path.join(process.cwd(), library),
                fileName: "model.json",
              });
            }),
          )
        ).flat();

        return { customTypes, slices };
      }

      default: {
        throw new UnsupportedAdapterError(adapterName);
      }
    }
  } finally {
    //keeping my repo :)
    //await fs.rm(process.cwd(), { recursive: true, force: true });
  }
}

const readModels = async <TType extends CustomType | SharedSlice>(args: {
  path: string;
  fileName: string;
}): Promise<TType[]> => {
  const entries = await fs.readdir(args.path, {
    recursive: true,
    withFileTypes: true,
  });

  const results = [];

  for (const entry of entries) {
    if (entry.name !== args.fileName || entry.isDirectory()) {
      continue;
    }

    const contents = await fs.readFile(
      path.join(entry.path, entry.name),
      "utf8",
    );

    results.push(JSON.parse(contents));
  }

  return results;
};

class UnsupportedAdapterError extends Error {
  name = "UnsupportedAdapterError";
  adapterName: string;

  constructor(adapterName: string, options?: ErrorOptions) {
    super("Slice Machine adapter is not supported.", options);

    this.adapterName = adapterName;
  }
}

// Get an auth token
const getAuthToken = async () => {
  console.log()
  const email = process.env.EMAIL
  const password = process.env.PASSWORD
  console.log(email)
  const authResponse = await fetch('https://auth.prismic.io/login', {
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const token = await authResponse.text(); //process.env.MIGRATION_API_TOKEN

  return token
}

main()
