import gql from "graphql-tag";

// DEAFCS: administrators' display names for map callouts
// (public.map_callout_labels). Raw documents until `yarn codegen` runs against
// an api with the table; rewrite them as Zeus selectors then. Kept apart from
// mapCalloutsQuery so an api without the table only loses the labels, never
// the callouts.

export const MAP_CALLOUT_LABELS_QUERY = gql`
  query MapCalloutLabels($mapName: String!) {
    map_callout_labels(where: { map_name: { _eq: $mapName } }) {
      map_name
      name
      label
    }
  }
`;

export const SET_MAP_CALLOUT_LABEL_MUTATION = gql`
  mutation SetMapCalloutLabel(
    $mapName: String!
    $name: String!
    $label: String!
  ) {
    insert_map_callout_labels_one(
      object: { map_name: $mapName, name: $name, label: $label }
      on_conflict: {
        constraint: map_callout_labels_pkey
        update_columns: [label]
      }
    ) {
      map_name
      name
      label
    }
  }
`;

export const CLEAR_MAP_CALLOUT_LABEL_MUTATION = gql`
  mutation ClearMapCalloutLabel($mapName: String!, $name: String!) {
    delete_map_callout_labels_by_pk(map_name: $mapName, name: $name) {
      map_name
      name
    }
  }
`;
