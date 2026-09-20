"""Held money that stops moving has to name itself to an operator."""
import asyncio
import logging

from src import associates, payments, ticketing
from test_payments import postgres, db, setup, fund  # noqa: F401  (fixtures)


async def _unbacked_transfer(db, fake, receipt):
    """Plan the worker transfer, then refund the payment outside this job: the
    transfer is unbacked, which is not retryable and nothing picks it up again."""
    async with db[0].connection() as conn:
        async with conn.transaction():
            await payments.route_ledger_plan(conn, 'alice', 'ticket-1',
                                             ticketing.accept_plan(1000, .9, 'Surveyor', 'ticket-1'))
    fake.paid[receipt['razorpay_payment_id']]['amount_refunded'] = 100000


def test_attention_operation_names_itself_for_reconciliation(db, caplog):
    async def run():
        client, fake, provider = await setup(db)
        try:
            await _unbacked_transfer(db, fake, await fund(client, fake))
            await payments.process_one(kinds=['transfer'])
            async with db[0].connection() as conn:
                return await (await conn.execute("SELECT status FROM payment_operations WHERE kind='transfer'")).fetchone()
        finally:
            await client.aclose()
            await provider.close()

    with caplog.at_level(logging.ERROR, logger='pattadar.payments'):
        operation = asyncio.run(run())
    assert operation['status'] == 'attention'
    assert '[payments:attention]' in caplog.text and 'kind=transfer' in caplog.text
    assert 'ticket=ticket-1' in caplog.text


def test_attention_opens_one_desk_task_the_operator_can_see(db):
    async def run():
        client, fake, provider = await setup(db)
        try:
            async with db[0].connection() as conn:
                for sql in associates.DDL:
                    if 'desk_tasks' in sql:
                        await conn.execute(sql)
            await _unbacked_transfer(db, fake, await fund(client, fake))
            await payments.process_one(kinds=['transfer'])
            # A second pass over the same parked operation must not write the
            # desk a second copy of the same job.
            async with db[0].connection() as conn:
                await conn.execute("UPDATE payment_operations SET status='retry',next_at=now() WHERE kind='transfer'")
            await payments.process_one(kinds=['transfer'])
            async with db[0].connection() as conn:
                return await (await conn.execute('SELECT * FROM desk_tasks')).fetchall()
        finally:
            await client.aclose()
            await provider.close()

    tasks = asyncio.run(run())
    assert len(tasks) == 1
    assert tasks[0]['kind'] == 'payment_attention' and tasks[0]['state'] == 'open'
    assert tasks[0]['ticket_id'] == 'ticket-1' and tasks[0]['owner_user_id'] == 'alice'
    assert 'transfer' in tasks[0]['headline'] and '₹900' in tasks[0]['headline']
    assert 'reconcil' in tasks[0]['detail']
