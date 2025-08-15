const add = (a: number, b: number) => a + b;

export const ExternalComponent = () => {
  return <div>External Component {add(1, 2)}</div>;
};
