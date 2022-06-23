import { VexEventTarget } from "../src";

function getRandomInt(max: number) {
    return Math.floor(Math.random() * max);
}

test("VexEventEmitter and VexEventTarget", async () => {
    let target = new VexEventTarget();

    let fn1 = jest.fn();
    let fn2 = jest.fn();

    target.remove("test1", fn1);

    target.emit("test1", undefined);


    target.on("test", fn1);

    let r1 = getRandomInt(10) + 10;
    for (let i = 0; i < r1; i++) target.emit("test", undefined);

    target.on("test", fn2);

    let r2 = getRandomInt(10) + 10;
    for (let i = 0; i < r2; i++) target.emit("test", undefined);

    expect(fn1).toBeCalledTimes(r1 + r2);
    expect(fn2).toBeCalledTimes(r2);

    target.remove("test", fn1);

    target.emit("test", undefined);

    expect(fn1).toBeCalledTimes(r1 + r2);
    expect(fn2).toBeCalledTimes(r2 + 1);

    target.clearListeners();

    target.emit("test", undefined);

    expect(fn1).toBeCalledTimes(r1 + r2);
    expect(fn2).toBeCalledTimes(r2 + 1);    
});