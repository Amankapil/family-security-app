package com.familysafety.app.service

import android.content.Context
import android.util.Log
import androidx.work.*
import com.familysafety.app.data.local.OfflineLocationStore
import com.familysafety.app.data.local.PreferencesManager
import com.familysafety.app.data.remote.ApiClient
import java.util.concurrent.TimeUnit

/**
 * Resilient Background Synchronization Worker
 * Drains buffered offline GPS fixes to backend in batches when internet is restored.
 */
class LocationSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val offlineStore = OfflineLocationStore(appContext)
    private val preferencesManager = PreferencesManager(appContext)

    override suspend fun doWork(): Result {
        if (!preferencesManager.isPaired) {
            Log.d(TAG, "Device not paired. Skipping offline sync.")
            return Result.success()
        }

        val initialPending = offlineStore.getPendingCount()
        if (initialPending == 0) {
            return Result.success()
        }

        Log.d(TAG, "Flushing offline location queue: $initialPending pending fixes.")

        var syncedTotal = 0
        var hasMore = true

        while (hasMore) {
            val batch = offlineStore.getOldestBatch(BATCH_SIZE)
            if (batch.isEmpty()) {
                hasMore = false
                break
            }

            val ids = batch.map { it.first }
            val payloads = batch.map { it.second }

            try {
                val response = ApiClient.apiService.uploadLocations(payloads)

                if (response.isSuccessful) {
                    offlineStore.deleteBatch(ids)
                    syncedTotal += ids.size
                    Log.d(TAG, "Batch synced successfully: ${ids.size} fixes. Remaining: ${offlineStore.getPendingCount()}")
                } else if (response.code() in 400..499 && response.code() != 429) {
                    // Client error or invalid device authorization; discard invalid batch or stop
                    Log.w(TAG, "Sync rejected with HTTP ${response.code()}. Halting sync.")
                    return Result.failure()
                } else {
                    Log.w(TAG, "Sync server response ${response.code()}. Retrying with backoff.")
                    return Result.retry()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network exception during offline sync", e)
                return Result.retry()
            }
        }

        Log.d(TAG, "Offline sync complete. Successfully transmitted $syncedTotal fixes.")
        return Result.success()
    }

    companion object {
        private const val TAG = "LocationSyncWorker"
        private const val BATCH_SIZE = 50
        private const val WORK_NAME_PERIODIC = "family_safety_periodic_sync"
        private const val WORK_NAME_IMMEDIATE = "family_safety_immediate_sync"

        /**
         * Trigger immediate one-time sync as soon as network is connected
         */
        fun triggerImmediateSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncRequest = OneTimeWorkRequestBuilder<LocationSyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    15,
                    TimeUnit.SECONDS
                )
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                WORK_NAME_IMMEDIATE,
                ExistingWorkPolicy.REPLACE,
                syncRequest
            )
        }

        /**
         * Schedule recurring background maintenance sync
         */
        fun schedulePeriodicSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val periodicRequest = PeriodicWorkRequestBuilder<LocationSyncWorker>(
                15, TimeUnit.MINUTES,
                5, TimeUnit.MINUTES
            )
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME_PERIODIC,
                ExistingPeriodicWorkPolicy.KEEP,
                periodicRequest
            )
        }
    }
}
